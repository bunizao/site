export const API_PREFIX = '/api' as const;

export const HEALTH_PATH = '/health' as const;
export const PING_PATH = '/ping' as const;

export const MOOD_PUBLIC_FEED_PATH = '/api/moods' as const;
export const MOOD_PUBLIC_COMMENTS_PATH = '/api/comments' as const;
export const MOOD_LIVE_FEED_PATH = '/v1/mood' as const;
export const MOOD_LIVE_META_PATH = '/v1/mood/meta' as const;
export const MOOD_ARCHIVE_FEED_PATH = '/v2/mood' as const;
export const MOOD_LIVE_COUNTS_PATH = '/v2/moods/live-counts' as const;
export const MOOD_ARCHIVE_STATS_PATH = '/v2/mood/stats' as const;
export const MOOD_SEARCH_PATH = '/v2/mood/search' as const;
export const MOOD_IMAGE_PROXY_BASE_PATH = '/v2/images' as const;
export const MOOD_MEDIA_PROXY_BASE_PATH = '/v2/media' as const;

export const LISTENING_PATH = '/v2/listening' as const;

// Blog comments, reactions, and reader identity. Reader-scoped, not
// blog-scoped — plans/blog-comments.md "API surface (v2 namespace)": nothing
// in the reader session or the reader table is blog-specific, so a future
// surface reuses these as-is.
export const COMMENTS_PATH = '/v2/comments' as const;
export const COMMENT_PATH_PREFIX = '/v2/comments/' as const;
export const REACTIONS_PATH = '/v2/reactions' as const;
export const REACTIONS_TOGGLE_PATH = '/v2/reactions/toggle' as const;
export const READER_ME_PATH = '/v2/reader/me' as const;
export const READER_VERIFY_PATH = '/v2/reader/verify' as const;
export const READER_RESEND_PATH = '/v2/reader/resend' as const;
export const READER_PREFERENCES_PATH = '/v2/reader/preferences' as const;
export const READER_AVATAR_PATH_PREFIX = '/v2/reader/avatar/' as const;
export const READER_OAUTH_PATH_PREFIX = '/oauth/reader/' as const;
export const READER_CONFIRM_PATH = '/reader/confirm' as const;

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
