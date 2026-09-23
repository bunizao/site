// Listening card markup — the framework-free template behind Listening.astro.
// Extracted so the mood feed (which renders media as HTML strings on both the
// server and the client) can emit the exact same card. Keep this module free
// of Astro/React/Vite-specific imports; the styles live in
// src/styles/listening.css and the behavior in src/lib/listening/controller.ts.

export const BLANK_LISTENING_ARTWORK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

export interface ListeningCardProps {
  title: string;
  artist: string;
  collection: string;
  /** Second meta segment. Empty string hides it (and its separator dot). */
  year: string;
  artworkUrl: string;
  accent?: { hue: number; chromaLight: number; chromaDark: number } | null;
  /** Track link (Apple Music / t.me / source). Empty string disables it. */
  linkUrl: string;
  previewUrl: string;
  appleCatalogId: string;
  /** Eyebrow text: "Now Playing", "Recently Played", "Audio", ... */
  statusLabel: string;
  isLive: boolean;
  isLoading: boolean;
  /** Skip the client-side live-track refresh (showcase specimen, mood audio). */
  isStatic: boolean;
  /** Extra pressed-label markup over the record (Apple Music lockup). */
  badgeHtml?: string;
  /** 'vinyl' (default) is the turntable disc; 'cover' is a plain album-art
   *  tile with an always-visible progress bar (mood audio). */
  artStyle?: 'vinyl' | 'cover';
  /** Seed the progress total time before playback starts (e.g. '3:43'). */
  totalTimeLabel?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const playIcon =
  '<svg class="listening-art-icon listening-art-icon--play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
const pauseIcon =
  '<svg class="listening-art-icon listening-art-icon--pause" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="4" y="4" width="4" height="16" rx="1"/></svg>';
const loadingIcon =
  '<svg class="listening-art-icon listening-art-icon--loading" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
const tonearm = [
  '<svg class="listening-art-tonearm" viewBox="0 0 96 84" aria-hidden="true">',
  '<g class="listening-art-tonearm-arm">',
  '<path d="M20 15 C33 24 45 39 58 56" class="listening-art-tonearm-shaft" />',
  '<rect x="54" y="53" width="17" height="7" rx="2" class="listening-art-tonearm-cartridge" transform="rotate(48 62.5 56.5)" />',
  '<circle cx="20" cy="15" r="7" class="listening-art-tonearm-pivot" />',
  '<circle cx="20" cy="15" r="2.8" class="listening-art-tonearm-hole" />',
  '</g>',
  '</svg>',
].join('');

export function renderListeningCardMarkup(props: ListeningCardProps): string {
  const {
    title,
    artist,
    collection,
    year,
    artworkUrl,
    accent = null,
    linkUrl,
    previewUrl,
    appleCatalogId,
    statusLabel,
    isLive,
    isLoading,
    isStatic,
    badgeHtml = '',
    artStyle = 'vinyl',
    totalTimeLabel = '',
  } = props;

  const isCover = artStyle === 'cover';
  const hasTrack = !isLoading;
  const hasLink = Boolean(linkUrl);
  const hasPlayableAudio = Boolean(appleCatalogId || previewUrl);
  const liveClass = isLive ? 'is-live' : 'is-recent';
  const playbackClass = hasPlayableAudio ? '' : ' has-no-playback';
  const trackLabel = `${title} — ${artist}`;
  const playLabel = hasPlayableAudio
    ? `Play ${title}`
    : hasLink
      ? `Open ${title}`
      : `${title} preview unavailable`;
  const containerLabel = hasTrack
    ? (isLive ? 'Now playing' : 'Recently played')
    : 'Loading listening track';

  // Cover style drops the turntable disc + tonearm for a plain album-art tile.
  const artInner = isCover
    ? [
        '<span class="listening-art-frame">',
        `<img src="${escapeHtml(artworkUrl)}" alt="" class="listening-art-img" data-listening-artwork`,
        ' loading="lazy" decoding="async" fetchpriority="low"',
        ' referrerpolicy="no-referrer" width="72" height="72" />',
        '<span class="listening-art-scrim" aria-hidden="true"></span>',
        `<span class="listening-art-icons" aria-hidden="true">${playIcon}${pauseIcon}${loadingIcon}</span>`,
        '</span>',
      ].join('')
    : [
        '<span class="listening-art-frame">',
        '<span class="listening-art-record" aria-hidden="true"></span>',
        `<img src="${escapeHtml(artworkUrl)}" alt="" class="listening-art-img" data-listening-artwork`,
        ' loading="lazy" decoding="async" fetchpriority="low"',
        ' referrerpolicy="no-referrer" width="40" height="40" />',
        `<span class="listening-art-icons" aria-hidden="true">${playIcon}${pauseIcon}${loadingIcon}</span>`,
        badgeHtml,
        '</span>',
        tonearm,
      ].join('');

  const accentAttributes = accent
    ? ` data-accent style="--listening-accent-h:${accent.hue.toFixed(1)};--listening-accent-c-light:${accent.chromaLight.toFixed(3)};--listening-accent-c-dark:${accent.chromaDark.toFixed(3)}"`
    : '';

  return [
    `<aside class="listening ${liveClass}${playbackClass}${isLoading ? ' is-loading' : ''}${isCover ? ' is-cover' : ''}"`,
    ' data-listening',
    accentAttributes,
    ` data-has-initial-track="${hasTrack}"`,
    ` data-now-playing="${isLive}"`,
    ` data-static="${isStatic}"`,
    ` aria-label="${escapeHtml(containerLabel)}">`,

    `<button type="button" class="listening-art ${liveClass}${playbackClass}${isCover ? ' is-cover' : ''}" data-listening-play`,
    ` data-apple-catalog-id="${escapeHtml(appleCatalogId)}"`,
    ` data-preview-url="${escapeHtml(previewUrl)}"`,
    ` data-track-url="${escapeHtml(hasLink ? linkUrl : '')}"`,
    ` data-track-title="${escapeHtml(title)}"`,
    `${!hasPlayableAudio && !hasLink ? ' disabled' : ''}`,
    ` aria-pressed="false" aria-label="${escapeHtml(playLabel)}">`,
    artInner,
    '</button>',

    '<div class="listening-copy">',
    '<p class="listening-eyebrow">',
    '<span class="listening-eyebrow-dot" aria-hidden="true"></span>',
    `<span class="listening-eyebrow-text" data-listening-status>${escapeHtml(statusLabel)}</span>`,
    '<span class="listening-eyebrow-wave" aria-hidden="true"><span></span><span></span><span></span><span></span></span>',
    '</p>',

    `<a href="${escapeHtml(hasLink ? linkUrl : '#')}" target="_blank" rel="noopener noreferrer"`,
    ' class="listening-track is-inline" data-listening-link',
    ` aria-label="${escapeHtml(hasLink ? `Open ${trackLabel}` : 'Loading listening track')}"`,
    `${hasLink ? '' : ' aria-disabled="true" tabindex="-1"'}>`,
    '<span class="listening-title" data-listening-title>',
    '<span class="listening-title-text" data-listening-title-text>',
    `<span data-listening-title-label data-title="${escapeHtml(title)}">${escapeHtml(title)}</span>`,
    `<span class="listening-title-duplicate" data-listening-title-duplicate data-title="${escapeHtml(title)}" aria-hidden="true">${escapeHtml(title)}</span>`,
    '</span>',
    '</span>',
    '<span class="listening-sep" aria-hidden="true">—</span>',
    `<span class="listening-artist" data-listening-artist>${escapeHtml(artist)}</span>`,
    '</a>',

    '<p class="listening-meta">',
    `<span data-listening-collection>${escapeHtml(collection)}</span>`,
    year
      ? '<span class="listening-meta-dot" aria-hidden="true"></span>'
        + `<span data-listening-year>${escapeHtml(year)}</span>`
      : '<span class="listening-meta-dot" aria-hidden="true" hidden></span>'
        + '<span data-listening-year hidden></span>',
    '</p>',

    '<div class="listening-progress-row" data-listening-progress-row>',
    '<span class="listening-time listening-time--elapsed" data-listening-elapsed>0:00</span>',
    '<div class="listening-progress" data-listening-progress role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">',
    '<div class="listening-progress-track"></div>',
    '<div class="listening-progress-fill" data-listening-fill></div>',
    '<div class="listening-progress-thumb" aria-hidden="true"></div>',
    '</div>',
    `<span class="listening-time listening-time--total" data-listening-total>${escapeHtml(totalTimeLabel)}</span>`,
    '</div>',

    '</div>',
    '</aside>',
  ].join('');
}
