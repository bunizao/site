import type { APIRoute } from 'astro';
import { getChannelInfo, type ChannelInfo, type Post } from '@/lib/telegram';
import { getNumericId, getRelatedLinks, getTextPreviewWithMedia } from '@/lib/mood-utils';
import {
  buildMoodDigestEmail,
  buildMoodNotificationEmail,
  buildSubscribeConfirmEmail,
} from '@/lib/notify/templates';

export const prerender = false;

const EVERY_5H_WINDOW_MS = 5 * 60 * 60 * 1000;
const MAX_DIGEST_POSTS = 20;

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeAbsoluteUrl(value: string | undefined, baseUrl: string): string | undefined {
  const raw = (value || '').trim();
  if (!raw) return undefined;

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function toEmailImageUrl(value: string | undefined, siteUrl: string): string | undefined {
  const absoluteUrl = normalizeAbsoluteUrl(value, siteUrl);
  if (!absoluteUrl) return undefined;

  let siteOrigin: string;
  try {
    siteOrigin = new URL(siteUrl).origin;
  } catch {
    return absoluteUrl;
  }

  const staticPrefix = `${siteOrigin}/static/`;
  if (absoluteUrl.startsWith(staticPrefix)) {
    return absoluteUrl;
  }

  try {
    if (new URL(absoluteUrl).origin === siteOrigin) {
      return absoluteUrl;
    }
  } catch {
    return absoluteUrl;
  }

  return `${staticPrefix}${absoluteUrl}`;
}

function getPostTimestamp(post: Post): number {
  const parsed = Date.parse(post.datetime);
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

async function loadChannelSnapshot(
  context: { request: Request; locals: any },
  siteUrl: string
): Promise<{ channelTitle: string; channelAvatarUrl?: string; posts: Post[] }> {
  try {
    const result = (await getChannelInfo(
      { request: context.request, locals: context.locals } as any,
      { type: 'list', skipCache: true }
    )) as ChannelInfo;

    const posts = (result.posts ?? [])
      .filter((post) => post?.id && post.type === 'text')
      .sort((a, b) => getNumericId(b.id) - getNumericId(a.id));

    return {
      channelTitle: result.title?.trim() || 'Mood Feed',
      channelAvatarUrl: toEmailImageUrl(result.avatar, siteUrl),
      posts,
    };
  } catch (error) {
    console.error('Notify preview failed to load channel snapshot:', error);
    return {
      channelTitle: 'Mood Feed',
      channelAvatarUrl: undefined,
      posts: [],
    };
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') === 'every_5h' ? 'every_5h' : 'daily';
  const timezoneParam = (url.searchParams.get('timezone') || '').trim();
  const timezone = timezoneParam && isValidTimezone(timezoneParam) ? timezoneParam : 'UTC';

  const siteUrl = (
    import.meta.env.PUBLIC_SITE_URL
    || locals?.runtime?.env?.PUBLIC_SITE_URL
    || locals?.env?.PUBLIC_SITE_URL
    || new URL(request.url).origin
  ).replace(/\/+$/, '');

  const { channelTitle, channelAvatarUrl, posts } = await loadChannelSnapshot({ request, locals }, siteUrl);
  const latestPost = posts[0];
  const latestPostId = latestPost?.id || '00000';

  const moodUrl = latestPost ? `${siteUrl}/mood/${latestPost.id}` : `${siteUrl}/mood`;
  const unsubscribeUrl = `${siteUrl}/api/notify/unsubscribe?token=preview_token`;
  const confirmUrl = `${siteUrl}/api/notify/confirm?token=preview_token`;

  const subscribeEmail = buildSubscribeConfirmEmail({
    siteUrl,
    confirmUrl,
  });

  const moodEmail = buildMoodNotificationEmail({
    moodUrl,
    unsubscribeUrl,
    previewText: latestPost ? getTextPreviewWithMedia(latestPost) : 'No mood post available yet.',
    relatedLinks: latestPost ? getRelatedLinks(latestPost, { baseUrl: siteUrl, maxCount: 8 }) : [],
    postId: latestPostId,
    channelTitle,
    channelAvatarUrl,
  });

  const now = new Date();
  const nowMs = now.getTime();
  const digestCandidates = mode === 'daily'
    ? (() => {
      const todayKey = getLocalDateKey(now, timezone);
      return posts.filter((post) => {
        const timestamp = getPostTimestamp(post);
        if (!timestamp || timestamp > nowMs) return false;
        return getLocalDateKey(new Date(timestamp), timezone) === todayKey;
      });
    })()
    : (() => {
      const since = nowMs - EVERY_5H_WINDOW_MS;
      return posts.filter((post) => {
        const timestamp = getPostTimestamp(post);
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
      const timestamp = getPostTimestamp(post);
      const postDate = new Date(timestamp || nowMs);
      return {
        postId: post.id,
        moodUrl: `${siteUrl}/mood/${post.id}`,
        previewText: getTextPreviewWithMedia(post),
        relatedLinks: getRelatedLinks(post, { baseUrl: siteUrl, maxCount: 5 }),
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

  return new Response(
    JSON.stringify({
      generatedAt: now.toISOString(),
      mode,
      timezone,
      source: {
        channelTitle,
        channelAvatarUrl,
        latestPostId: latestPost?.id ?? null,
        digestPostIds: digestPosts.map((post) => post.postId),
      },
      subjects: {
        subscribe: subscribeEmail.subject,
        mood: moodEmail.subject,
        digest: digestEmail.subject,
      },
      html: {
        subscribe: subscribeEmail.html,
        mood: moodEmail.html,
        digest: digestEmail.html,
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
};
