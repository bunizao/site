export const API_PREFIX = '/api' as const;

export const HEALTH_PATH = '/health' as const;
export const PING_PATH = '/ping' as const;

export const MOOD_PUBLIC_FEED_PATH = '/api/moods' as const;
export const MOOD_PUBLIC_COMMENTS_PATH = '/api/comments' as const;
export const MOOD_LIVE_FEED_PATH = '/v1/mood' as const;
export const MOOD_LIVE_META_PATH = '/v1/mood/meta' as const;
export const MOOD_ARCHIVE_FEED_PATH = '/v2/mood' as const;
export const MOOD_ARCHIVE_STATS_PATH = '/v2/mood/stats' as const;
export const MOOD_IMAGE_PROXY_BASE_PATH = '/v2/images' as const;

export const LISTENING_PATH = '/v2/listening' as const;

export const CV_READ_PATH = '/api/cv' as const;
export const CV_REQUEST_PATH = '/api/cv/request' as const;
export const CV_PDF_PATH = '/api/cv/pdf' as const;
export const CV_ADMIN_BASE_PATH = '/api/admin/cv' as const;

export const ADMIN_BASE_PATH = '/admin' as const;
export const NOTIFY_BASE_PATH = '/notify' as const;
export const GHOST_WEBHOOK_PATH = '/webhooks/ghost' as const;
export const TELEGRAM_WEBHOOK_PATH = '/webhooks/telegram' as const;
export const MUSICKIT_TOKEN_PATH = '/musickit/token' as const;

export const LEGACY_ADMIN_BASE_PATH = '/v2/admin' as const;
export const LEGACY_NOTIFY_BASE_PATH = '/v2/notify' as const;
export const LEGACY_GHOST_WEBHOOK_PATH = '/v2/ghost/webhook' as const;
export const LEGACY_MUSICKIT_TOKEN_PATH = '/v2/musickit/token' as const;
export const LEGACY_HEALTH_PATH = '/v2/health' as const;
