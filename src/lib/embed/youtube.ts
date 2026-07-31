const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/u;
export const MAX_YOUTUBE_START_SECONDS = 7 * 24 * 60 * 60;

export type YouTubePosterQuality = 'maxresdefault' | 'hqdefault';

export interface YouTubeVideoReference {
  id: string;
  startSeconds: number;
}

export interface YouTubeEmbedMarkupOptions extends YouTubeVideoReference {
  title: string;
  channelName: string;
  channelUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function parseStartSeconds(value: string | null): number {
  if (!value) return 0;

  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/u.test(trimmed)) {
    return Math.min(Number(trimmed), MAX_YOUTUBE_START_SECONDS);
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/u.exec(trimmed);
  if (!match || !match.slice(1).some(Boolean)) return 0;

  const seconds = Number(match[1] ?? 0) * 3600
    + Number(match[2] ?? 0) * 60
    + Number(match[3] ?? 0);
  return Math.min(seconds, MAX_YOUTUBE_START_SECONDS);
}

function safeHttpUrl(value: string | undefined): string {
  if (!value) return '';

  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return '';
    }
    return url.href;
  } catch {
    return '';
  }
}

function readVideoId(url: URL): string {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] ?? '';
  }

  if (![
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
  ].includes(hostname)) {
    return '';
  }

  if (url.pathname === '/watch') {
    return url.searchParams.get('v') ?? '';
  }

  const [kind, id] = url.pathname.split('/').filter(Boolean);
  return kind === 'shorts' || kind === 'embed' || kind === 'live' ? id ?? '' : '';
}

export function parseYouTubeVideoUrl(value: string): YouTubeVideoReference | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username
    || url.password
  ) {
    return null;
  }

  const id = readVideoId(url);
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(id)) return null;

  return {
    id,
    startSeconds: parseStartSeconds(url.searchParams.get('start') ?? url.searchParams.get('t')),
  };
}

export function isYouTubeVideoId(value: string): boolean {
  return YOUTUBE_VIDEO_ID_PATTERN.test(value);
}

export function youtubeWatchUrl(id: string, startSeconds = 0): string {
  if (!isYouTubeVideoId(id)) throw new TypeError('Invalid YouTube video ID');

  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', id);
  if (startSeconds > 0) {
    url.searchParams.set('t', `${Math.min(Math.floor(startSeconds), MAX_YOUTUBE_START_SECONDS)}s`);
  }
  return url.href;
}

export function youtubePosterPath(id: string, quality: YouTubePosterQuality): string {
  if (!isYouTubeVideoId(id)) throw new TypeError('Invalid YouTube video ID');
  return `/static/youtube/${id}/${quality}.jpg`;
}

export function renderYouTubeEmbedMarkup(options: YouTubeEmbedMarkupOptions): string {
  const id = options.id;
  if (!isYouTubeVideoId(id)) throw new TypeError('Invalid YouTube video ID');

  const startSeconds = Math.max(
    0,
    Math.min(Math.floor(options.startSeconds), MAX_YOUTUBE_START_SECONDS),
  );
  const title = options.title.trim() || 'YouTube video';
  const channelName = options.channelName.trim() || 'YouTube';
  const channelUrl = safeHttpUrl(options.channelUrl);
  const watchUrl = youtubeWatchUrl(id, startSeconds);
  const posterUrl = youtubePosterPath(id, 'maxresdefault');
  const posterFallbackUrl = youtubePosterPath(id, 'hqdefault');
  const initial = Array.from(channelName)[0]?.toUpperCase() || 'Y';
  const channelMarkup = channelUrl
    ? `<a class="yt__channel" href="${escapeHtml(channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(channelName)}</a>`
    : `<span class="yt__channel">${escapeHtml(channelName)}</span>`;

  return [
    `<figure class="yt" data-yt data-video="${id}" data-start="${startSeconds}">`,
    '<div class="yt__stage">',
    `<button class="yt__frame" type="button" data-yt-frame aria-label="Play ${escapeHtml(title)}">`,
    `<img class="yt__poster" data-yt-poster data-yt-poster-fallback="${posterFallbackUrl}" src="${posterUrl}" alt="" loading="lazy" decoding="async" />`,
    '<span class="yt__veil" aria-hidden="true"></span>',
    '<span class="yt__disc" aria-hidden="true">',
    '<svg class="yt__glyph yt__glyph--play" viewBox="0 0 24 24"><path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.5-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z"/></svg>',
    '<svg class="yt__glyph yt__glyph--wait" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9" /></svg>',
    '</span>',
    '</button>',
    '<div class="yt__down">',
    '<p class="yt__down-title">This video did not load</p>',
    '<p class="yt__down-body">It may be blocked on this network, or the owner may not allow embedding.</p>',
    `<a class="yt__down-cta" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener noreferrer">`,
    'Watch on YouTube',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    '</a>',
    '</div>',
    `<iframe class="yt__player" data-yt-player title="${escapeHtml(title)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen hidden></iframe>`,
    '</div>',
    '<figcaption class="yt__caption">',
    `<span class="yt__avatar yt__avatar--mono" aria-hidden="true">${escapeHtml(initial)}</span>`,
    `<span class="yt__title">${escapeHtml(title)}</span>`,
    '<span class="yt__meta">',
    channelMarkup,
    `<a class="yt__out" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener noreferrer">`,
    '<svg class="yt__out-mark" viewBox="0 0 28 20" aria-hidden="true"><path fill-rule="evenodd" d="M4 2h20a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Zm7 3.8v8.4l7.3-4.2L11 5.8Z"/></svg>',
    'YouTube',
    '<svg class="yt__out-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    '</a>',
    '</span>',
    '</figcaption>',
    '</figure>',
  ].join('');
}
