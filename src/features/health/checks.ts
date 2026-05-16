import { buildMoodFeedResponse } from '@/features/mood/server/feed-service';
import {
  loadMoodChannelSnapshot,
} from '@/features/mood/server/channel-service';
import { loadMoodCommentsPage } from '@/features/mood/server/comments-service';
import { getCurrentListeningTrack } from '@/features/home/server/listening';
import {
  buildMoodDigestEmail,
  buildMoodNotificationEmail,
  buildSubscribeConfirmEmail,
  buildSubscribeWelcomeEmail,
  buildUnsubscribeNoticeEmail,
} from '@/features/notify/server/templates';
import { readEnv, readPublicEnv } from '@/lib/runtime/env';
import type {
  ApiHealthCheck,
  ApiHealthCheckReport,
  ApiHealthCheckResult,
  ApiHealthContext,
  ApiHealthReport,
  ApiHealthState,
  ApiHealthStatus,
} from './types';

const DEFAULT_CHECK_TIMEOUT_MS = 4_500;
const DEEP_CHECK_TIMEOUT_MS = 8_000;

function nowMs(): number {
  return Date.now();
}

function getDurationMs(startedAt: number): number {
  return Math.max(0, nowMs() - startedAt);
}

function getSiteUrl(context: ApiHealthContext): string {
  return (
    readPublicEnv(context.locals, 'SITE_URL')
    || new URL(context.request.url).origin
  ).replace(/\/+$/, '');
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Health check timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    task.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

async function checkMoodFeed(
  context: ApiHealthContext,
  state: ApiHealthState
): Promise<ApiHealthCheckResult> {
  const { channelInfo, posts } = await loadMoodChannelSnapshot(
    { request: context.request, locals: context.locals },
    { skipCache: context.deep }
  );
  const feed = await buildMoodFeedResponse(
    { request: context.request, locals: context.locals },
    channelInfo,
    posts
  );

  state.moodFeed = feed;
  state.latestMoodId = feed.posts[0]?.id ?? posts[0]?.id;

  if (!state.latestMoodId) {
    return {
      status: 'down',
      message: 'Mood feed returned no posts',
      metadata: {
        postCount: feed.posts.length,
      },
    };
  }

  return {
    status: 'ok',
    metadata: {
      latestId: state.latestMoodId,
      postCount: feed.posts.length,
      channelTitle: feed.channel.title ?? '',
    },
  };
}

async function checkListening(
  context: ApiHealthContext
): Promise<ApiHealthCheckResult> {
  const result = await getCurrentListeningTrack(context.locals);

  if (!result.track?.title || !result.track?.artist) {
    return {
      status: 'degraded',
      message: 'Listening API returned no playable track',
      metadata: {
        configured: result.configured,
        source: result.source,
      },
    };
  }

  if (!result.configured || result.source === 'fallback') {
    return {
      status: 'degraded',
      message: 'Fallback listening data is active',
      metadata: {
        configured: result.configured,
        source: result.source,
      },
    };
  }

  return {
    status: 'ok',
    metadata: {
      source: result.source,
      track: `${result.track.artist} - ${result.track.title}`,
    },
  };
}

async function checkComments(
  context: ApiHealthContext,
  state: ApiHealthState
): Promise<ApiHealthCheckResult> {
  if (!state.latestMoodId) {
    return {
      status: 'skipped',
      message: 'No mood post is available for comment probing',
    };
  }

  const comments = await loadMoodCommentsPage(
    { request: context.request, locals: context.locals },
    { postId: state.latestMoodId }
  );

  if (!Array.isArray(comments.comments) || typeof comments.hasMore !== 'boolean') {
    return {
      status: 'degraded',
      message: 'Comments API returned an invalid payload shape',
    };
  }

  return {
    status: 'ok',
    metadata: {
      postId: state.latestMoodId,
      commentCount: comments.comments.length,
      hasMore: comments.hasMore,
    },
  };
}

async function checkNotifyTemplates(
  context: ApiHealthContext,
  state: ApiHealthState
): Promise<ApiHealthCheckResult> {
  const siteUrl = getSiteUrl(context);
  const moodUrl = state.latestMoodId
    ? `${siteUrl}/mood/${state.latestMoodId}`
    : `${siteUrl}/mood`;
  const unsubscribeUrl = `${siteUrl}/api/notify/unsubscribe?token=health_check`;
  const channelTitle = state.moodFeed?.channel.title ?? 'Mood Feed';

  const emails = [
    buildSubscribeConfirmEmail({
      siteUrl,
      confirmUrl: `${siteUrl}/api/notify/confirm?token=health_check`,
    }),
    buildSubscribeWelcomeEmail({
      moodUrl: `${siteUrl}/mood`,
      unsubscribeUrl,
      deliveryMode: 'daily',
    }),
    buildUnsubscribeNoticeEmail({
      siteUrl,
      subscribeUrl: `${siteUrl}/mood?subscribe=1`,
    }),
    buildMoodNotificationEmail({
      moodUrl,
      unsubscribeUrl,
      previewText: 'Health check mood preview',
      previewHtml: '<p>Health check mood preview</p>',
      relatedLinks: [],
      postId: state.latestMoodId ?? 'health-check',
      channelTitle,
      channelAvatarUrl: state.moodFeed?.channel.avatar ?? '',
    }),
    buildMoodDigestEmail({
      mode: 'daily',
      moodUrl: `${siteUrl}/mood`,
      unsubscribeUrl,
      channelTitle,
      channelAvatarUrl: state.moodFeed?.channel.avatar ?? '',
      posts: [],
    }),
  ];

  const invalidEmail = emails.find((email) => !email.subject || !email.html);
  if (invalidEmail) {
    return {
      status: 'degraded',
      message: 'Notify template rendering returned an incomplete email',
    };
  }

  return {
    status: 'ok',
    metadata: {
      templateCount: emails.length,
    },
  };
}

async function checkMoodImageWorker(
  context: ApiHealthContext,
  state: ApiHealthState
): Promise<ApiHealthCheckResult> {
  const baseUrl = getSiteUrl(context);
  const imageUrl = state.moodFeed?.posts.find((post) => post.image)?.image;
  if (!imageUrl) {
    return {
      status: 'skipped',
      message: 'No mood image is available for worker probing',
    };
  }

  const absoluteImageUrl = toAbsoluteUrl(imageUrl, baseUrl);
  const probeUrl = new URL(absoluteImageUrl);
  if (probeUrl.hostname.endsWith('.example.test')) {
    return {
      status: 'skipped',
      message: 'Fixture mood image URL is not publicly probeable',
    };
  }

  const response = await fetch(absoluteImageUrl, {
    method: 'HEAD',
    headers: {
      Accept: 'image/avif,image/webp,image/jpeg,image/*,*/*;q=0.8',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(4_000),
  });

  if (!response.ok) {
    return {
      status: 'degraded',
      message: `Mood image worker returned ${response.status}`,
      metadata: {
        imageUrl: absoluteImageUrl,
      },
    };
  }

  return {
    status: 'ok',
    metadata: {
      imageUrl: absoluteImageUrl,
      contentType: response.headers.get('content-type') ?? '',
    },
  };
}

async function checkTelegramWebhook(
  context: ApiHealthContext
): Promise<ApiHealthCheckResult> {
  const botToken = readEnv(context.locals, 'TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    return {
      status: 'skipped',
      message: 'TELEGRAM_BOT_TOKEN is not configured',
    };
  }

  const expectedUrl = readEnv(context.locals, 'TELEGRAM_EXPECTED_WEBHOOK_URL')
    || `${getSiteUrl(context)}/api/telegram-webhook`;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    return {
      status: 'degraded',
      message: `Telegram webhook info returned ${response.status}`,
    };
  }

  const payload = await response.json() as {
    ok?: boolean;
    result?: {
      url?: string;
      pending_update_count?: number;
      allowed_updates?: string[];
      last_error_message?: string;
    };
  };

  if (!payload.ok) {
    return {
      status: 'degraded',
      message: 'Telegram webhook info returned ok=false',
    };
  }

  if ((payload.result?.url ?? '') !== expectedUrl) {
    return {
      status: 'degraded',
      message: 'Telegram bot points at an unexpected webhook URL',
      metadata: {
        expectedUrl,
        actualUrl: payload.result?.url ?? '',
      },
    };
  }

  if (payload.result?.last_error_message) {
    return {
      status: 'degraded',
      message: payload.result.last_error_message,
      metadata: {
        pendingUpdateCount: payload.result.pending_update_count ?? 0,
      },
    };
  }

  return {
    status: 'ok',
    metadata: {
      pendingUpdateCount: payload.result?.pending_update_count ?? 0,
      allowedUpdates: payload.result?.allowed_updates ?? [],
    },
  };
}

const healthChecks: ApiHealthCheck[] = [
  {
    id: 'mood-feed',
    label: 'Mood feed API',
    critical: true,
    run: checkMoodFeed,
  },
  {
    id: 'listening',
    label: 'Listening API',
    critical: false,
    run: checkListening,
  },
  {
    id: 'comments',
    label: 'Mood comments API',
    critical: false,
    run: checkComments,
  },
  {
    id: 'notify-templates',
    label: 'Notify templates',
    critical: false,
    run: checkNotifyTemplates,
  },
  {
    id: 'mood-image-worker',
    label: 'Mood image worker',
    critical: false,
    deepOnly: true,
    timeoutMs: DEEP_CHECK_TIMEOUT_MS,
    run: checkMoodImageWorker,
  },
  {
    id: 'telegram-webhook',
    label: 'Telegram webhook API',
    critical: false,
    deepOnly: true,
    timeoutMs: DEEP_CHECK_TIMEOUT_MS,
    run: checkTelegramWebhook,
  },
];

function aggregateStatus(checks: ApiHealthCheckReport[]): Exclude<ApiHealthStatus, 'skipped'> {
  if (checks.some((check) => check.critical && check.status === 'down')) {
    return 'down';
  }

  if (checks.some((check) => check.status === 'degraded' || check.status === 'down')) {
    return 'degraded';
  }

  return 'ok';
}

async function runCheck(
  check: ApiHealthCheck,
  context: ApiHealthContext,
  state: ApiHealthState
): Promise<ApiHealthCheckReport> {
  const startedAt = nowMs();
  const timeoutMs = check.timeoutMs ?? (context.deep ? DEEP_CHECK_TIMEOUT_MS : DEFAULT_CHECK_TIMEOUT_MS);

  try {
    const result = await withTimeout(check.run(context, state), timeoutMs);
    return {
      id: check.id,
      label: check.label,
      critical: check.critical,
      durationMs: getDurationMs(startedAt),
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    return {
      id: check.id,
      label: check.label,
      critical: check.critical,
      status: check.critical ? 'down' : 'degraded',
      durationMs: getDurationMs(startedAt),
      message,
    };
  }
}

export async function runApiHealth(context: ApiHealthContext): Promise<ApiHealthReport> {
  const startedAt = nowMs();
  const state: ApiHealthState = {};
  const checks: ApiHealthCheckReport[] = [];
  const activeChecks = healthChecks.filter((check) => context.deep || !check.deepOnly);

  for (const check of activeChecks) {
    checks.push(await runCheck(check, context, state));
  }

  return {
    status: aggregateStatus(checks),
    mode: context.deep ? 'deep' : 'default',
    checkedAt: new Date().toISOString(),
    durationMs: getDurationMs(startedAt),
    checks,
  };
}
