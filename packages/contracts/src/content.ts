export const CONTENT_DOCUMENT_SOURCES = ['mood', 'post'] as const;

export type ContentDocumentSource = (typeof CONTENT_DOCUMENT_SOURCES)[number];

export interface PostLocaleTag {
  locale: string;
  canonicalSlug?: string;
}

const POST_LOCALE_RE = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;
const POST_CANONICAL_SLUG_RE = /^[^\s:/?#]+$/;

/**
 * Parses Ghost's internal post locale tag from tag.name.
 *
 * `#<locale>` marks the post's own locale. `#<locale>:<canonical>` marks a
 * translated version of the canonical post. Ghost removes the colon from
 * tag.slug, so callers must pass tag.name.
 */
export function parsePostLocaleTag(tagName: string): PostLocaleTag | null {
  const normalized = tagName.trim().toLowerCase();
  if (!normalized.startsWith('#')) return null;

  const value = normalized.slice(1);
  const separatorIndex = value.indexOf(':');
  const locale = separatorIndex === -1 ? value : value.slice(0, separatorIndex);
  const canonicalSlug = separatorIndex === -1
    ? undefined
    : value.slice(separatorIndex + 1);

  if (!POST_LOCALE_RE.test(locale)) return null;
  if (canonicalSlug !== undefined && !POST_CANONICAL_SLUG_RE.test(canonicalSlug)) {
    return null;
  }

  return canonicalSlug ? { locale, canonicalSlug } : { locale };
}

export type ContentMediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'embed'
  | 'sticker'
  | 'link-preview'
  | 'location'
  | 'poll';
export type ContentMediaLayout = 'landscape' | 'portrait' | 'ultra-tall';

export interface MediaItem {
  id?: string;
  type: ContentMediaType;
  src?: string;
  href?: string;
  fallbackSrc?: string | null;
  posterSrc?: string | null;
  thumbnailSrc?: string | null;
  width?: number | null;
  height?: number | null;
  layout?: ContentMediaLayout | null;
  alt?: string;
  title?: string;
  description?: string;
  siteName?: string;
  linkPreviewLayout?: 'large' | 'compact';
  fileName?: string;
  fileSizeLabel?: string;
  mimeType?: string;
  durationSeconds?: number | null;
  originalUrl?: string;
}

export interface Reaction {
  emoji: string;
  emojiId?: string;
  emojiImage?: string;
  count: string;
  isPaid: boolean;
}

export interface ForwardedFrom {
  name: string;
  href?: string;
  author?: string;
}

export interface QuoteRef {
  text: string;
  author?: string;
  href?: string;
  thumbnailSrc?: string;
}

export interface ContentDocument {
  id: string;
  source: ContentDocumentSource;
  datetime: string;
  updatedAt?: string;
  url?: string;
  slug?: string;
  title?: string;
  excerpt?: string;
  tag?: string;
  tags?: string[];
  bodyHtml: string;
  previewText?: string;
  previewHtml?: string;
  hero?: MediaItem | null;
  media: MediaItem[];
  forwardedFrom?: ForwardedFrom | null;
  quote?: QuoteRef | null;
  reactions?: Reaction[];
  commentsCount?: number | string;
}

export interface MoodContentDocument extends ContentDocument {
  source: 'mood';
  groupIds?: string[];
  channel?: ContentChannelSummary;
  /** True when the post's copy in the Telegram discussion group is known
      (`mood_posts.discussion_message_id`) and mood comments are enabled, so
      the compose box can post into the thread. False or absent: the page
      keeps the "Leave a comment on Telegram" link instead. */
  discussionLinked?: boolean;
  /** True once the read path has verified, from live traffic, that the
      embed's comment ids are the group's message ids, which is what a
      web reply to a Telegram-origin comment needs to thread correctly.
      Gates reply-to on `telegram` items only; replies to `web` items are
      always allowed. */
  discussionRepliesEnabled?: boolean;
}

export interface PostContentDocument extends ContentDocument {
  source: 'post';
  title: string;
  slug: string;
}

export interface ContentChannelSummary {
  slug?: string;
  title?: string;
  titleHTML?: string;
  emojiId?: string;
  avatar?: string;
  description?: string;
  descriptionHTML?: string;
}
