import type { APIRoute } from 'astro';
import { jsonOk } from '@/lib/http/json-response';
import { getRelatedLinks, getTextPreviewHtml, getTextPreviewWithMedia } from '@/features/mood/shared/utils';
import {
  buildMoodDigestEmail,
  buildMoodNotificationEmail,
  buildSubscribeConfirmEmail,
  buildSubscribeWelcomeEmail,
  buildUnsubscribeNoticeEmail,
} from '@/features/notify/server/templates';
import { buildNotifyPageHtml } from '@/features/notify/server/page-template';
import { readPublicEnv } from '@/lib/runtime/env';
import {
  loadMoodChannelSnapshot,
  toMoodEmailImageUrl,
} from '@/features/mood/server/channel-service';

export const prerender = false;

const EVERY_5H_WINDOW_MS = 5 * 60 * 60 * 1000;
const MAX_DIGEST_POSTS = 20;

function createRichPreviewPost(now: Date) {
  return {
    id: 'rich-preview',
    title: 'Rich newsletter preview',
    type: 'text',
    datetime: now.toISOString(),
    tags: ['preview'],
    text: 'Bold quote answer source',
    content: [
      '<blockquote>',
      '<strong>Bold quote</strong><br>',
      'A compact newsletter preview with <code>inline code</code> and ',
      '<a href="https://example.org/newsletter-preview">source</a>.',
      '</blockquote>',
      '<a class="bookmark-card" href="https://example.org/a-very-long-link-card-title" target="_blank" rel="noopener noreferrer">',
      '<span class="bookmark-card__content">',
      '<span class="bookmark-card__title">A very long bookmark title that should wrap across multiple lines in the newsletter preview instead of being crushed into one line</span>',
      '<span class="bookmark-card__description">This description should also keep enough room to be useful, because one-line summaries hide the exact context the newsletter reader needs.</span>',
      '<span class="bookmark-card__meta">example.org</span>',
      '</span>',
      '</a>',
    ].join(''),
    reactions: [],
  };
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getPostTimestamp(datetime: string): number {
  const parsed = Date.parse(datetime);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLocalDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getLocalTimeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function getLocalDateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'every_5h' ? 'every_5h' : 'daily';
  const sample = url.searchParams.get('sample') === 'rich' ? 'rich' : 'live';
  const timezoneParam = (url.searchParams.get('timezone') || '').trim();
  const timezone = timezoneParam && isValidTimezone(timezoneParam) ? timezoneParam : 'UTC';
  const now = new Date();

  const siteUrl = (
    readPublicEnv(locals, 'SITE_URL')
    || new URL(request.url).origin
  ).replace(/\/+$/, '');

  const previewSource = sample === 'rich'
    ? {
      channelTitle: 'Levitating',
      channelAvatarUrl: '',
      posts: [createRichPreviewPost(now)],
    }
    : null;

  const liveSource = previewSource
    ? null
    : await loadMoodChannelSnapshot(
      { request, locals },
      {
        skipCache: true,
        textOnly: true,
      }
    );

  const channelTitle = previewSource?.channelTitle || liveSource?.channelInfo.title?.trim() || 'Mood Feed';
  const channelAvatarUrl = previewSource?.channelAvatarUrl ?? toMoodEmailImageUrl(liveSource?.channelInfo.avatar, siteUrl, locals);
  const posts = previewSource?.posts || liveSource?.posts || [];
  const latestPost = posts[0];
  const latestPostId = latestPost?.id || '00000';

  const moodUrl = latestPost ? `${siteUrl}/mood/${latestPost.id}` : `${siteUrl}/mood`;
  const unsubscribeUrl = `${siteUrl}/api/notify/unsubscribe?token=preview_token`;
  const confirmUrl = `${siteUrl}/api/notify/confirm?token=preview_token`;

  const subscribeEmail = buildSubscribeConfirmEmail({
    siteUrl,
    confirmUrl,
  });
  const welcomeEmail = buildSubscribeWelcomeEmail({
    moodUrl: `${siteUrl}/mood`,
    unsubscribeUrl,
    deliveryMode: mode,
  });
  const cancelEmail = buildUnsubscribeNoticeEmail({
    siteUrl,
    subscribeUrl: `${siteUrl}/mood?subscribe=1`,
  });

  const moodEmail = buildMoodNotificationEmail({
    moodUrl,
    unsubscribeUrl,
    previewText: latestPost ? getTextPreviewWithMedia(latestPost) : 'No mood post available yet.',
    previewHtml: latestPost ? getTextPreviewHtml(latestPost, { preserveBookmarks: true }) : '',
    relatedLinks: latestPost ? getRelatedLinks(latestPost, {
      baseUrl: siteUrl,
      maxCount: 8,
      excludeInlineAnchors: true,
      excludeInternalLinks: true,
    }) : [],
    postId: latestPostId,
    channelTitle,
    channelAvatarUrl,
  });

  const nowMs = now.getTime();
  const digestCandidates = mode === 'daily'
    ? (() => {
      const todayKey = getLocalDateKey(now, timezone);
      return posts.filter((post) => {
        const timestamp = getPostTimestamp(post.datetime);
        if (!timestamp || timestamp > nowMs) return false;
        return getLocalDateKey(new Date(timestamp), timezone) === todayKey;
      });
    })()
    : (() => {
      const since = nowMs - EVERY_5H_WINDOW_MS;
      return posts.filter((post) => {
        const timestamp = getPostTimestamp(post.datetime);
        return Boolean(timestamp && timestamp > since && timestamp <= nowMs);
      });
    })();

  const digestSourcePosts = digestCandidates.length
    ? digestCandidates
    : latestPost
      ? [latestPost]
      : [];

  const digestPosts = digestSourcePosts
    .slice(0, MAX_DIGEST_POSTS)
    .map((post) => {
      const timestamp = getPostTimestamp(post.datetime);
      const postDate = new Date(timestamp || nowMs);
      return {
        postId: post.id,
        moodUrl: `${siteUrl}/mood/${post.id}`,
        previewText: getTextPreviewWithMedia(post),
        previewHtml: getTextPreviewHtml(post, { preserveBookmarks: true }),
        relatedLinks: getRelatedLinks(post, {
          baseUrl: siteUrl,
          maxCount: 5,
          excludeInlineAnchors: true,
          excludeInternalLinks: true,
        }),
        timeLabel: getLocalTimeLabel(postDate, timezone),
        dateLabel: getLocalDateLabel(postDate, timezone),
      };
    });

  const digestEmail = buildMoodDigestEmail({
    mode,
    moodUrl: `${siteUrl}/mood`,
    unsubscribeUrl,
    channelTitle,
    channelAvatarUrl,
    posts: digestPosts,
  });

  const sampleEmail = 'reader@example.com';
  const callbackPages = {
    confirmSuccess: buildNotifyPageHtml({
      label: 'subscription',
      title: 'You’re in.',
      message: 'Mood updates will start landing in your inbox. Welcome aboard.',
      status: 'success',
      enableCongratsFx: true,
    }),
    confirmError: buildNotifyPageHtml({
      label: 'subscription',
      title: 'Couldn’t confirm that.',
      message: 'This confirmation link has expired or already been used. Try subscribing again to get a fresh one.',
      status: 'error',
    }),
    unsubscribePrompt: buildNotifyPageHtml({
      label: 'unsubscribe',
      title: 'Pause mood updates?',
      message: `We'll stop sending mood emails to ${sampleEmail}. You can come back any time.`,
      status: 'info',
      actionsHtml: [
        '<div class="actions-row">',
        '  <div class="action-group">',
        '    <form method="post" action="#preview-noop">',
        '      <button type="submit" class="button"><span>Pause updates</span><span class="button-arrow" aria-hidden="true">&rarr;</span></button>',
        '    </form>',
        '    <span class="action-hint">Stop sending mood emails</span>',
        '  </div>',
        '  <div class="action-group">',
        '    <a href="/mood" class="button button--ghost"><span>Keep them coming</span></a>',
        '    <span class="action-hint">Stay subscribed</span>',
        '  </div>',
        '</div>',
      ].join(''),
    }),
    unsubscribeSuccess: buildNotifyPageHtml({
      label: 'unsubscribe',
      title: 'Mood updates paused.',
      message: 'No more mood emails will land in this inbox. Come back anytime.',
      status: 'success',
    }),
    unsubscribeError: buildNotifyPageHtml({
      label: 'unsubscribe',
      title: 'Couldn’t pause updates.',
      message: 'This unsubscribe link looks off. Try again from a recent email.',
      status: 'error',
    }),
  };

  return jsonOk(
    {
      generatedAt: now.toISOString(),
      mode,
      sample,
      timezone,
      source: {
        channelTitle,
        channelAvatarUrl,
        latestPostId: latestPost?.id ?? null,
        digestPostIds: digestPosts.map((post) => post.postId),
      },
      subjects: {
        subscribe: subscribeEmail.subject,
        welcome: welcomeEmail.subject,
        mood: moodEmail.subject,
        digest: digestEmail.subject,
        cancel: cancelEmail.subject,
      },
      html: {
        subscribe: subscribeEmail.html,
        welcome: welcomeEmail.html,
        mood: moodEmail.html,
        digest: digestEmail.html,
        cancel: cancelEmail.html,
      },
      callbackPages,
    },
    {
      'Cache-Control': 'no-store, max-age=0',
    }
  );
};
