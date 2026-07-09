import { $fetch } from 'ofetch';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { LRUCache } from 'lru-cache';
import flourite from 'flourite';
import Prism from 'prismjs';
import { readEnv as readRuntimeEnv } from '@/lib/runtime/env';
import { normalizeMoodImageBase } from './image-base';

// Import Prism language components
import 'prismjs-components-importer/cjs/prism-c';
import 'prismjs-components-importer/cjs/prism-clojure';
import 'prismjs-components-importer/cjs/prism-cpp';
import 'prismjs-components-importer/cjs/prism-csharp';
import 'prismjs-components-importer/cjs/prism-css';
import 'prismjs-components-importer/cjs/prism-dart';
import 'prismjs-components-importer/cjs/prism-docker';
import 'prismjs-components-importer/cjs/prism-elixir';
import 'prismjs-components-importer/cjs/prism-go';
import 'prismjs-components-importer/cjs/prism-markup';
import 'prismjs-components-importer/cjs/prism-java';
import 'prismjs-components-importer/cjs/prism-javascript';
import 'prismjs-components-importer/cjs/prism-json';
import 'prismjs-components-importer/cjs/prism-julia';
import 'prismjs-components-importer/cjs/prism-kotlin';
import 'prismjs-components-importer/cjs/prism-lua';
import 'prismjs-components-importer/cjs/prism-markdown';
import 'prismjs-components-importer/cjs/prism-pascal';
import 'prismjs-components-importer/cjs/prism-php';
import 'prismjs-components-importer/cjs/prism-python';
import 'prismjs-components-importer/cjs/prism-ruby';
import 'prismjs-components-importer/cjs/prism-rust';
import 'prismjs-components-importer/cjs/prism-sql';
import 'prismjs-components-importer/cjs/prism-typescript';
import 'prismjs-components-importer/cjs/prism-yaml';

// Types
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

export interface Comment {
  id: string;
  author: string;
  authorAvatar?: string;
  datetime: string;
  content: string;
  reactions: Reaction[];
}

export interface Post {
  id: string;
  title: string;
  type: 'text' | 'service';
  datetime: string;
  tags: string[];
  text: string;
  content: string;
  forwardedFrom?: ForwardedFrom;
  reactions: Reaction[];
  comments?: Comment[];
  commentsCount?: number;
}

export interface ChannelInfo {
  posts: Post[];
  title: string;
  titleHTML: string;
  description: string;
  descriptionHTML: string;
  avatar: string;
}

interface ContentProcessorConfig {
  staticProxy: string;
  hdImageBase?: string;
  id?: string;
  index?: number;
  title?: string;
  channel?: string;
  channelTitle?: string;
  host?: string;
  headers?: Record<string, string>;
  replyVariant?: 'raw' | 'detail-card';
  lazyVideo?: boolean;
}

function escapeHtml(value: string = ''): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

const INLINE_IMAGE_WIDTHS = [480, 800, 1200];
const MODAL_IMAGE_WIDTHS = [800, 1200, 1600];
const INLINE_IMAGE_SIZES = '(min-width: 1024px) 720px, (min-width: 640px) 90vw, 100vw';
const MODAL_IMAGE_SIZES = '(min-width: 1024px) 900px, 90vw';
const LINK_PREVIEW_DESCRIPTION_MAX_LENGTH = 260;
const EAGER_FEED_IMAGE_MAX_INDEX = 0;

function getFeedImageLoading(index?: number): 'eager' | 'lazy' {
  return (index ?? 0) > EAGER_FEED_IMAGE_MAX_INDEX ? 'lazy' : 'eager';
}

function getFeedVideoPreload(index?: number): 'auto' | 'metadata' {
  return (index ?? 0) > EAGER_FEED_IMAGE_MAX_INDEX ? 'metadata' : 'auto';
}

function buildHdImageUrl(hdImageBase: string, path: string): string {
  if (!hdImageBase) return '';
  return `${hdImageBase}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Upgrade image URL to higher quality by modifying the width parameter
 * Note: This is now a fallback - HD images come from the Worker proxy
 */
function upgradeImageQuality(url: string): string {
  if (!url) return url;
  // Remove existing width parameter and add higher quality one
  // Telegram CDN supports ?w= parameter for width
  const cleanUrl = url.replace(/[?&]w=\d+/g, '');
  const separator = cleanUrl.includes('?') ? '&' : '?';
  // Request 1280px width for better quality on desktop
  return `${cleanUrl}${separator}w=1280`;
}

function withWidthParam(url: string, width: number): string {
  if (!url) return url;
  const isAbsolute = /^(https?:)?\/\//i.test(url);
  const parsed = new URL(url, 'https://local.invalid');
  parsed.searchParams.set('w', String(width));
  if (isAbsolute) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function buildSrcSet(url: string, widths: number[]): string {
  if (!url) return '';
  return widths.map((width) => `${withWidthParam(url, width)} ${width}w`).join(', ');
}

function buildImageFallbackAttrs(fallbackSrc: string, fallbackSrcSet: string, fallbackSizes: string): string {
  const safeFallbackSrc = sanitizeUrlValue(fallbackSrc, 'src');
  if (!safeFallbackSrc) {
    return '';
  }

  const attrs = [` data-fallback-src="${escapeHtml(safeFallbackSrc)}"`];
  const safeFallbackSrcSet = sanitizeSrcSet(fallbackSrcSet);
  if (safeFallbackSrcSet) {
    attrs.push(` data-fallback-srcset="${escapeHtml(safeFallbackSrcSet)}"`);
    attrs.push(` data-fallback-sizes="${escapeHtml(fallbackSizes)}"`);
  }

  attrs.push(
    ' onerror="if(this.dataset.fallbackApplied===\'1\')return;this.dataset.fallbackApplied=\'1\';const s=this.dataset.fallbackSrc;if(s){this.src=s;}const ss=this.dataset.fallbackSrcset;if(ss){this.setAttribute(\'srcset\',ss);const z=this.dataset.fallbackSizes||\'\';if(z){this.setAttribute(\'sizes\',z);}else{this.removeAttribute(\'sizes\');}}else{this.removeAttribute(\'srcset\');this.removeAttribute(\'sizes\');}"'
  );
  return attrs.join('');
}

function normalizeMediaUrl(value: string): string {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  return value;
}

function toStaticProxyUrl(value: string, staticProxy: string): string {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return '';
  // Check if already proxied (starts with /static/ or contains /static/https:)
  if (normalized.startsWith(staticProxy) || normalized.includes('/static/https:')) return normalized;
  if (/^(data:|blob:)/i.test(normalized)) return '';
  if (/^https?:\/\//i.test(normalized)) {
    return `${staticProxy}${normalized.replace('://', ':/')}`;
  }
  return normalized;
}

function shouldKeepExternalCssUrl(source: string, urlPrefixEnd: number): boolean {
  const remainingUrl = source.slice(urlPrefixEnd);
  return remainingUrl.startsWith('static-maps.yandex.ru/');
}

function extractBackgroundImage(style: string): string {
  if (!style) return '';
  const match = style.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ?? '';
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const trimmed = value.slice(0, maxLength).trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  const truncated = lastSpace > Math.floor(maxLength * 0.6) ? trimmed.slice(0, lastSpace) : trimmed;
  return `${truncated}...`;
}

// LRU Cache for Telegram API responses
const cache = new LRUCache<string, ChannelInfo | Post>({
  ttl: 1000 * 60 * 5, // 5 minutes
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (item) => {
    return JSON.stringify(item).length;
  },
});

const commentsCountCache = new LRUCache<string, number>({
  ttl: 1000 * 60 * 10, // 10 minutes
  max: 1000,
});

interface TelegramPostOpenGraphMeta {
  description: string;
  image: string;
}

interface TelegramEmbedState {
  hasUnsupportedMediaNotice: boolean;
  hasVisibleText: boolean;
}

type CachedTelegramPostMeta =
  | { found: true; value: TelegramPostOpenGraphMeta | null }
  | { found: false };

type CachedTelegramEmbedState =
  | { found: true; value: TelegramEmbedState | null }
  | { found: false };

const TELEGRAM_POST_META_MISS: CachedTelegramPostMeta = { found: false };
const TELEGRAM_EMBED_STATE_MISS: CachedTelegramEmbedState = { found: false };

const telegramPostMetaCache = new LRUCache<string, CachedTelegramPostMeta>({
  ttl: 1000 * 60 * 10, // 10 minutes
  max: 500,
});

const telegramEmbedStateCache = new LRUCache<string, CachedTelegramEmbedState>({
  ttl: 1000 * 60 * 10, // 10 minutes
  max: 500,
});

const TELEGRAM_PARSE_CACHE_VERSION = 'sticker-fallback-v1';
const QUOTE_IMAGE_ERROR_HANDLER =
  "this.closest('.mood-item-quote-media')?.remove();const q=this.closest('.mood-item-quote');q?.classList.remove('mood-item-quote--with-media','mood-item-quote--media-only','mood-detail-quote--with-media','mood-detail-quote--media-only');if(q&&!q.textContent.trim())q.remove();";

function getEnv(env: ImportMetaEnv, Astro: any, name: string): string {
  return readRuntimeEnv(Astro.locals, name, env);
}

const telegramHeaderAllowList = [
  'accept',
  'accept-language',
  'if-modified-since',
  'if-none-match',
  'user-agent',
];

function buildTelegramRequestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const headerName of telegramHeaderAllowList) {
    const value = request.headers.get(headerName);
    if (!value) continue;
    headers[headerName] = value;
  }
  return headers;
}

function buildTelegramPostCacheKey(host: string, channel: string, postId: string): string {
  return `${host}/${channel}/${postId}`;
}

function parseTelegramEmbedState(html: string): TelegramEmbedState {
  const $ = cheerio.load(html, {}, false);
  const message = $('.tgme_widget_message').first();
  const hasUnsupportedMediaNotice = message.find('.message_media_not_supported_wrap, .message_media_not_supported_label').length > 0;
  const hasVisibleText = message
    .find('.tgme_widget_message_text.js-message_text')
    .toArray()
    .some((element) => $(element).text().replace(/\s+/g, ' ').trim().length > 0);

  return {
    hasUnsupportedMediaNotice,
    hasVisibleText,
  };
}

function parseTelegramOpenGraphMeta(html: string): TelegramPostOpenGraphMeta | null {
  const $ = cheerio.load(html, {}, false);
  const description = $('meta[property="og:description"]').attr('content')?.trim() ?? '';
  const image = $('meta[property="og:image"]').attr('content')?.trim() ?? '';

  if (!description && !image) {
    return null;
  }

  return {
    description,
    image,
  };
}

async function getTelegramEmbedState(
  host: string,
  channel: string,
  postId: string,
  headers: Record<string, string> = {}
): Promise<TelegramEmbedState | null> {
  const cacheKey = buildTelegramPostCacheKey(host, channel, postId);
  const cached = telegramEmbedStateCache.get(cacheKey);
  if (cached !== undefined) {
    return cached.found ? cached.value : null;
  }

  try {
    const html = await $fetch<string>(`https://${host}/${channel}/${postId}?embed=1&mode=tme`, {
      headers,
      retry: 2,
      retryDelay: 100,
    });
    const state = parseTelegramEmbedState(html);
    telegramEmbedStateCache.set(cacheKey, { found: true, value: state });
    return state;
  } catch (error) {
    telegramEmbedStateCache.set(cacheKey, TELEGRAM_EMBED_STATE_MISS);
    return null;
  }
}

async function getTelegramOpenGraphMeta(
  host: string,
  channel: string,
  postId: string,
  headers: Record<string, string> = {}
): Promise<TelegramPostOpenGraphMeta | null> {
  const cacheKey = buildTelegramPostCacheKey(host, channel, postId);
  const cached = telegramPostMetaCache.get(cacheKey);
  if (cached !== undefined) {
    return cached.found ? cached.value : null;
  }

  try {
    const html = await $fetch<string>(`https://${host}/${channel}/${postId}`, {
      headers,
      retry: 2,
      retryDelay: 100,
    });
    const meta = parseTelegramOpenGraphMeta(html);
    telegramPostMetaCache.set(cacheKey, { found: true, value: meta });
    return meta;
  } catch (error) {
    telegramPostMetaCache.set(cacheKey, TELEGRAM_POST_META_MISS);
    return null;
  }
}

export async function getTelegramPostFallbackInfo(
  Astro: any,
  postId: string
): Promise<{
  description: string;
  image: string;
  hasUnsupportedMediaNotice: boolean;
  hasVisibleText: boolean;
}> {
  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') || 't.me';
  const channel = getEnv(import.meta.env, Astro, 'CHANNEL');
  const headers = buildTelegramRequestHeaders(Astro.request);

  if (!channel || !postId) {
    return {
      description: '',
      image: '',
      hasUnsupportedMediaNotice: false,
      hasVisibleText: false,
    };
  }

  const [meta, state] = await Promise.all([
    getTelegramOpenGraphMeta(host, channel, postId, headers),
    getTelegramEmbedState(host, channel, postId, headers),
  ]);

  return {
    description: meta?.description?.trim() ?? '',
    image: meta?.image?.trim() ?? '',
    hasUnsupportedMediaNotice: Boolean(state?.hasUnsupportedMediaNotice),
    hasVisibleText: Boolean(state?.hasVisibleText),
  };
}

function buildTextParagraphMarkup(text: string): string {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  if (!normalized) {
    return '';
  }

  return `<p>${escapeHtml(normalized).replace(/\n/g, '<br>')}</p>`;
}

async function enrichDetailPost(
  post: Post,
  {
    host,
    channel,
    headers,
    hdImageBase,
    currentEmbedState,
  }: {
    host: string;
    channel: string;
    headers: Record<string, string>;
    hdImageBase: string;
    currentEmbedState: TelegramEmbedState;
  }
): Promise<Post> {
  const shouldRecoverOwnText = currentEmbedState.hasUnsupportedMediaNotice && !currentEmbedState.hasVisibleText && !post.text.trim();

  if (shouldRecoverOwnText) {
    const meta = await getTelegramOpenGraphMeta(host, channel, post.id, headers);
    const recoveredText = meta?.description?.trim() ?? '';
    if (recoveredText) {
      const textMarkup = buildTextParagraphMarkup(recoveredText);
      if (textMarkup) {
        post.content = `${post.content}${textMarkup}`;
      }
      post.text = recoveredText;
      if (!post.title.trim()) {
        post.title = recoveredText.split('\n')[0]?.trim() ?? recoveredText;
      }
    }
  }

  if (!hdImageBase || !post.content.includes('mood-detail-quote')) {
    return post;
  }

  const $ = cheerio.load(`<div data-root="detail-content">${post.content}</div>`, {}, false);
  const localQuotes = $('a.mood-detail-quote[href^="/mood/"]').toArray();

  for (const quote of localQuotes) {
    const quoteEl = $(quote);
    if (quoteEl.find('.mood-detail-quote-media').length > 0) {
      continue;
    }

    const href = quoteEl.attr('href') ?? '';
    const match = href.match(/^\/mood\/(\d+)$/);
    const targetId = match?.[1] ?? '';
    if (!targetId) {
      continue;
    }

    const targetState = await getTelegramEmbedState(host, channel, targetId, headers);
    const shouldRenderFallbackThumb = Boolean(
      targetState?.hasUnsupportedMediaNotice && !targetState.hasVisibleText
    );

    if (!shouldRenderFallbackThumb) {
      continue;
    }

    const previewSrc = sanitizeUrlValue(buildHdImageUrl(hdImageBase, `/mood/${encodeURIComponent(targetId)}/0`), 'src');
    if (!previewSrc) {
      continue;
    }

    quoteEl.addClass('mood-detail-quote--with-media mood-item-quote--with-media');
    quoteEl.prepend(
      `<span class="mood-detail-quote-media mood-item-quote-media"><img class="mood-detail-quote-image mood-item-quote-image" src="${escapeHtml(previewSrc)}" alt="" loading="lazy" onerror="${escapeHtml(QUOTE_IMAGE_ERROR_HANDLER)}" /></span>`
    );
  }

  post.content = $('[data-root="detail-content"]').html() ?? post.content;
  return post;
}

// Content processors
function getVideoStickers($: CheerioAPI, item: Element, { staticProxy, index, lazyVideo = false }: ContentProcessorConfig): string {
  return $(item)
    .find('.js-videosticker_video')
    ?.map((_index, video) => {
      const url = $(video)?.attr('src') ?? '';
      const imgurl = $(video).find('img')?.attr('src') ?? '';
      const videoSrc = sanitizeUrlValue(toStaticProxyUrl(url, staticProxy), 'src');
      const posterSrc = sanitizeUrlValue(toStaticProxyUrl(imgurl, staticProxy), 'src');
      if (!videoSrc) {
        return '';
      }
      const loading = getFeedImageLoading(index);
      const posterMarkup = posterSrc
        ? `<img class="sticker" src="${escapeHtml(posterSrc)}" alt="Video Sticker" loading="${loading}" />`
        : '';
      const sourceAttr = lazyVideo
        ? `data-mood-video-src="${escapeHtml(videoSrc)}"`
        : `src="${escapeHtml(videoSrc)}"`;
      const preloadAttr = lazyVideo ? 'preload="none"' : 'preload';
      const autoplayAttr = lazyVideo ? 'data-mood-autoplay="true" data-mood-video-lazy="true"' : 'autoplay';

      return `
    <div style="background-image: none; width: 256px;">
      <video ${sourceAttr} width="100%" height="100%" alt="Video Sticker" ${preloadAttr} muted ${autoplayAttr} loop playsinline disablepictureinpicture >
        ${posterMarkup}
      </video>
    </div>
    `;
    })
    ?.get()
    ?.join('') ?? '';
}

function getImageStickers($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  return $(item)
    .find('.tgme_widget_message_sticker')
    ?.map((_index, image) => {
      const url = $(image)?.attr('data-webp') ?? '';
      const imageSrc = sanitizeUrlValue(toStaticProxyUrl(url, staticProxy), 'src');
      if (!imageSrc) {
        return '';
      }
      return `<img class="sticker" src="${escapeHtml(imageSrc)}" style="width: 256px;" alt="Sticker" loading="${getFeedImageLoading(index)}" />`;
    })
    ?.get()
    ?.join('') ?? '';
}

function getImages($: CheerioAPI, item: Element, { staticProxy, hdImageBase = '', id, index, title }: ContentProcessorConfig): string {
  const images = $(item)
    .find('.tgme_widget_message_photo_wrap')
    ?.map((_index, photo) => {
      const style = $(photo).attr('style') ?? '';
      const url = style.match(/url\(["'](.*?)["']/)?.[1];
      // Upgrade to higher quality image (fallback)
      const highQualityUrl = upgradeImageQuality(url ?? '');
      const fallbackUrl = sanitizeUrlValue(toStaticProxyUrl(highQualityUrl, staticProxy), 'src');

      // Use HD Worker proxy if configured, with fallback to static proxy
      const hdUrl = hdImageBase && id
        ? sanitizeUrlValue(buildHdImageUrl(hdImageBase, `/mood/${encodeURIComponent(id)}/${_index}`), 'src')
        : '';
      const imgSrc = hdUrl || fallbackUrl;
      if (!imgSrc) {
        return '';
      }

      const canUseFallback = Boolean(hdUrl && fallbackUrl && hdUrl !== fallbackUrl);

      const inlineSrcSet = sanitizeSrcSet(buildSrcSet(imgSrc, INLINE_IMAGE_WIDTHS));
      const modalSrcSet = sanitizeSrcSet(buildSrcSet(imgSrc, MODAL_IMAGE_WIDTHS));
      const fallbackInlineSrcSet = canUseFallback ? sanitizeSrcSet(buildSrcSet(fallbackUrl, INLINE_IMAGE_WIDTHS)) : '';
      const fallbackModalSrcSet = canUseFallback ? sanitizeSrcSet(buildSrcSet(fallbackUrl, MODAL_IMAGE_WIDTHS)) : '';
      const srcSetAttr = inlineSrcSet
        ? ` srcset="${escapeHtml(inlineSrcSet)}" sizes="${escapeHtml(INLINE_IMAGE_SIZES)}"`
        : '';
      const modalSrcSetAttr = modalSrcSet
        ? ` srcset="${escapeHtml(modalSrcSet)}" sizes="${escapeHtml(MODAL_IMAGE_SIZES)}"`
        : '';
      const fallbackAttr = canUseFallback
        ? buildImageFallbackAttrs(fallbackUrl, fallbackInlineSrcSet, INLINE_IMAGE_SIZES)
        : '';
      const fallbackModalAttr = canUseFallback
        ? buildImageFallbackAttrs(fallbackUrl, fallbackModalSrcSet, MODAL_IMAGE_SIZES)
        : '';

      const photoStyle = $(photo).find('.tgme_widget_message_photo').first().attr('style') ?? '';
      const widthMatch = style.match(/width:\s*(\d+)px/i);
      const heightMatch = style.match(/height:\s*(\d+)px/i);
      // Telegram uses padding-top percentage for aspect ratio (height/width * 100)
      const paddingMatch = `${style};${photoStyle}`.match(/padding-top:\s*([\d.]+)%/i);
      const imageWidth = widthMatch ? Number.parseInt(widthMatch[1], 10) : 0;
      let imageHeight = heightMatch ? Number.parseInt(heightMatch[1], 10) : 0;
      // Calculate height from padding-top if not directly available
      if (!imageHeight && paddingMatch && imageWidth) {
        const paddingPercent = Number.parseFloat(paddingMatch[1]);
        imageHeight = Math.round(imageWidth * paddingPercent / 100);
      }
      // Detect portrait (vertical) images: height > width * 1.2
      // Detect ultra-tall images: height > width * 2.5
      const isPortrait = imageHeight > 0 && imageHeight > imageWidth * 1.2;
      const isUltraTall = imageHeight > 0 && imageHeight > imageWidth * 2.5;
      const portraitClass = isUltraTall ? ' image-preview-wrap--ultra-tall' : isPortrait ? ' image-preview-wrap--portrait' : '';
      const imageSizeVars = [
        imageWidth ? `--image-width:${imageWidth}px` : '',
        imageHeight ? `--image-height:${imageHeight}px` : '',
      ].filter(Boolean).join(';');
      const widthStyle = imageSizeVars ? ` style="${imageSizeVars}"` : '';
      const widthAttr = imageWidth ? ` width="${imageWidth}"` : '';
      const heightAttr = imageHeight ? ` height="${imageHeight}"` : '';
      const safePostId = (id ?? '').replace(/[^a-z0-9_-]/gi, '');
      const popoverId = `modal-${safePostId || 'post'}-${_index}`;
      const escapedTitle = escapeHtml(title ?? '');

      return `
      <button class="image-preview-button image-preview-wrap${portraitClass}" popovertarget="${popoverId}" popovertargetaction="show"${widthStyle}>
        <img src="${escapeHtml(imgSrc)}"${srcSetAttr}${fallbackAttr} alt="${escapedTitle}" loading="${getFeedImageLoading(index)}"${widthAttr}${heightAttr} />
      </button>
      <button class="image-preview-button modal" id="${popoverId}" popovertarget="${popoverId}" popovertargetaction="hide" popover>
        <img class="modal-img" src="${escapeHtml(imgSrc)}"${modalSrcSetAttr}${fallbackModalAttr} alt="${escapedTitle}" loading="lazy" />
      </button>
    `;
    })
    ?.get() ?? [];
  return images.length ? `<div class="image-list-container ${images.length % 2 === 0 ? 'image-list-even' : 'image-list-odd'}">${images?.join('')}</div>` : '';
}

function buildUnsupportedMediaCard(
  { channel, id }: Pick<ContentProcessorConfig, 'channel' | 'id'>,
  label: string
): string {
  const safeLabel = escapeHtml(label.trim() || 'Open Telegram to view this media');
  const href = channel && id ? sanitizeUrlValue(`https://t.me/${channel}/${id}`, 'href') : '';
  const tagName = href ? 'a' : 'div';
  const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
  const externalAttrs = href ? ' target="_blank" rel="noopener noreferrer"' : '';

  return `<${tagName} class="mood-detail-quote mood-item-quote mood-comment-quote mood-unsupported-media-card"${hrefAttr}${externalAttrs}><div class="mood-detail-quote-meta mood-item-quote-meta"><span class="mood-detail-quote-source mood-item-quote-author">Telegram</span></div><p class="mood-detail-quote-text mood-item-quote-text">${safeLabel}</p></${tagName}>`;
}

function buildUnsupportedMediaImageFallback(
  {
    hdImageBase,
    id,
    index,
    title,
  }: Pick<ContentProcessorConfig, 'hdImageBase' | 'id' | 'index' | 'title'>
): string {
  if (!hdImageBase || !id) {
    return '';
  }

  const imgSrc = sanitizeUrlValue(buildHdImageUrl(hdImageBase, `/mood/${encodeURIComponent(id)}/0`), 'src');
  if (!imgSrc) {
    return '';
  }

  const inlineSrcSet = sanitizeSrcSet(buildSrcSet(imgSrc, INLINE_IMAGE_WIDTHS));
  const modalSrcSet = sanitizeSrcSet(buildSrcSet(imgSrc, MODAL_IMAGE_WIDTHS));
  const srcSetAttr = inlineSrcSet
    ? ` srcset="${escapeHtml(inlineSrcSet)}" sizes="${escapeHtml(INLINE_IMAGE_SIZES)}"`
    : '';
  const modalSrcSetAttr = modalSrcSet
    ? ` srcset="${escapeHtml(modalSrcSet)}" sizes="${escapeHtml(MODAL_IMAGE_SIZES)}"`
    : '';
  const safePostId = id.replace(/[^a-z0-9_-]/gi, '');
  const popoverId = `modal-${safePostId || 'post'}-unsupported`;
  const escapedTitle = escapeHtml(title || 'Telegram media');

  return `
      <div class="image-list-container image-list-odd">
        <button class="image-preview-button image-preview-wrap image-preview-wrap--fallback" popovertarget="${popoverId}" popovertargetaction="show">
          <img src="${escapeHtml(imgSrc)}"${srcSetAttr} alt="${escapedTitle}" loading="${getFeedImageLoading(index)}" style="aspect-ratio:auto;" />
        </button>
        <button class="image-preview-button modal" id="${popoverId}" popovertarget="${popoverId}" popovertargetaction="hide" popover>
          <img class="modal-img" src="${escapeHtml(imgSrc)}"${modalSrcSetAttr} alt="${escapedTitle}" loading="lazy" />
        </button>
      </div>
    `;
}

async function getUnsupportedMediaFallback(
  $: CheerioAPI,
  item: Element,
  { hdImageBase = '', id, index, title, channel }: ContentProcessorConfig
): Promise<string> {
  const className = $(item).attr('class') ?? '';
  const hasUnsupportedMediaNotice = $(item).find('.message_media_not_supported_wrap, .message_media_not_supported_label').length > 0;
  const hasPhoto = $(item).find('.tgme_widget_message_photo_wrap').length > 0;
  const hasPlayableVideo = $(item).find('.tgme_widget_message_video_wrap video, .tgme_widget_message_roundvideo_wrap video').length > 0;
  const hasNotSupportedPlayer = $(item).find('.tgme_widget_message_video_player.not_supported').length > 0;
  const hasSticker = $(item).find('.tgme_widget_message_sticker, .js-videosticker_video').length > 0;
  if (hasPhoto || hasPlayableVideo || hasNotSupportedPlayer || hasSticker) {
    return '';
  }

  if (!className.includes('text_not_supported_wrap') || !hasUnsupportedMediaNotice || !id) {
    return '';
  }

  const imageFallback = buildUnsupportedMediaImageFallback({ hdImageBase, id, index, title });
  if (imageFallback) {
    return imageFallback;
  }

  return buildUnsupportedMediaCard(
    { channel, id },
    title || 'Open Telegram to view this media'
  );
}

function getVideo($: CheerioAPI, item: Element, { staticProxy, index, lazyVideo = false }: ContentProcessorConfig): string {
  const htmlParts: string[] = [];

  const getVideoLayoutClass = (sourceEl: cheerio.Cheerio<Element>): string => {
    const style = sourceEl.attr('style') ?? '';
    const paddingMatch = style.match(/padding-top:\s*([\d.]+)%/i);
    const paddingPercent = paddingMatch ? Number.parseFloat(paddingMatch[1]) : 0;
    if (!paddingPercent) {
      return '';
    }

    const ratio = 100 / paddingPercent;
    if (ratio < 0.6) {
      return 'video--ultra-tall';
    }
    if (ratio < 0.8) {
      return 'video--portrait';
    }
    return '';
  };

  const applyVideoAttributes = (videoEl: cheerio.Cheerio<Element>, contextEl: cheerio.Cheerio<Element>): void => {
    const src = videoEl.attr('src');
    if (src) {
      const videoSrc = toStaticProxyUrl(src, staticProxy);
      if (lazyVideo) {
        videoEl.removeAttr('src').attr('data-mood-video-src', videoSrc);
      } else {
        videoEl.attr('src', videoSrc);
      }
    }

    videoEl.find('source').each((_sourceIndex, source) => {
      const sourceEl = $(source);
      const sourceSrc = sourceEl.attr('src');
      if (sourceSrc) {
        const videoSrc = toStaticProxyUrl(sourceSrc, staticProxy);
        if (lazyVideo) {
          sourceEl.removeAttr('src').attr('data-mood-video-src', videoSrc);
        } else {
          sourceEl.attr('src', videoSrc);
        }
      }
    });

    const explicitPoster = videoEl.attr('poster') ?? '';
    const dataPoster = videoEl.attr('data-poster') ?? videoEl.attr('data-thumb') ?? '';
    const wrapPoster = extractBackgroundImage(contextEl.attr('style') ?? '');
    const wrapDataPoster = contextEl.attr('data-poster') ?? contextEl.attr('data-thumb') ?? '';
    const nestedPoster = contextEl
      .find('.tgme_widget_message_video_thumb, .tgme_widget_message_roundvideo_thumb, [style*="background-image"]')
      .map((_index, node) => extractBackgroundImage($(node).attr('style') ?? ''))
      .get()
      .find((value) => Boolean(value)) ?? '';
    const poster = explicitPoster || dataPoster || wrapDataPoster || nestedPoster || wrapPoster;
    if (poster) {
      const posterUrl = toStaticProxyUrl(poster, staticProxy);
      videoEl.attr('poster', posterUrl);
    }

    videoEl
      .removeAttr('width')
      .removeAttr('height')
      .attr('controls', 'true')
      .attr('preload', lazyVideo ? 'none' : getFeedVideoPreload(index))
      .attr('muted', 'true')
      .attr('loop', 'true')
      .attr('playsinline', 'true')
      .attr('webkit-playsinline', 'true');

    if (lazyVideo) {
      videoEl
        .removeAttr('autoplay')
        .attr('data-mood-autoplay', 'true')
        .attr('data-mood-video-lazy', 'true');
    } else {
      videoEl.attr('autoplay', 'true');
    }
  };

  const resolvePosterContext = (wrapEl: cheerio.Cheerio<Element>): cheerio.Cheerio<Element> => {
    const player = wrapEl.closest('.tgme_widget_message_video_player, .tgme_widget_message_roundvideo_player') as cheerio.Cheerio<Element>;
    return player.length ? player : wrapEl;
  };

  $(item)
    .find('.tgme_widget_message_video_wrap')
    .each((_index, wrap) => {
      const wrapEl = $(wrap);
      const contextEl = resolvePosterContext(wrapEl);
      wrapEl.find('video').each((_videoIndex, video) => {
        const videoEl = $(video);
        const layoutClass = getVideoLayoutClass(wrapEl);
        if (layoutClass) {
          const existingClass = (videoEl.attr('class') ?? '').trim();
          videoEl.attr('class', `${existingClass} ${layoutClass}`.trim());
        }
        applyVideoAttributes(videoEl, contextEl);
        htmlParts.push($.html(videoEl));
      });
    });

  $(item)
    .find('.tgme_widget_message_roundvideo_wrap')
    .each((_index, wrap) => {
      const wrapEl = $(wrap);
      const contextEl = resolvePosterContext(wrapEl);
      wrapEl.find('video').each((_videoIndex, video) => {
        const videoEl = $(video);
        const layoutClass = getVideoLayoutClass(wrapEl);
        if (layoutClass) {
          const existingClass = (videoEl.attr('class') ?? '').trim();
          videoEl.attr('class', `${existingClass} ${layoutClass}`.trim());
        }
        applyVideoAttributes(videoEl, contextEl);
        htmlParts.push($.html(videoEl));
      });
    });

  return htmlParts.join('');
}

function getAudio($: CheerioAPI, item: Element, { staticProxy }: ContentProcessorConfig): string {
  const audio = $(item).find('.tgme_widget_message_voice');
  if (audio.length) {
    audio.attr('src', toStaticProxyUrl(audio.attr('src') ?? '', staticProxy)).attr('controls', 'true');
    return $.html(audio);
  }
  return '';
}

function parseAspectRatioFromStyle(style: string): number | null {
  const paddingMatch = style.match(/padding-top:\s*([\d.]+)%/i);
  if (paddingMatch) {
    const paddingPercent = Number.parseFloat(paddingMatch[1]);
    if (Number.isFinite(paddingPercent) && paddingPercent > 0) {
      return 100 / paddingPercent;
    }
  }

  const widthMatch = style.match(/width:\s*([\d.]+)px/i);
  const heightMatch = style.match(/height:\s*([\d.]+)px/i);
  if (widthMatch && heightMatch) {
    const width = Number.parseFloat(widthMatch[1]);
    const height = Number.parseFloat(heightMatch[1]);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return width / height;
    }
  }

  return null;
}

function getNotSupportedVideo(
  $: CheerioAPI,
  item: Element,
  { staticProxy, channel = '', id = '' }: ContentProcessorConfig
): string {
  const player = $(item).find('.tgme_widget_message_video_player.not_supported').first();
  const hasPlayableVideo = $(item).find('.tgme_widget_message_video_wrap video, .tgme_widget_message_roundvideo_wrap video').length > 0;
  if (!player.length || hasPlayableVideo || !channel || !id) {
    return '';
  }

  const thumbEl = player.find('.tgme_widget_message_video_thumb').first();
  const videoWrapEl = player.find('.tgme_widget_message_video_wrap').first();
  const thumbStyle = thumbEl.attr('style') ?? '';
  const videoWrapStyle = videoWrapEl.attr('style') ?? '';
  const playerStyle = player.attr('style') ?? '';
  const thumbUrl = extractBackgroundImage(thumbStyle);
  const proxiedThumb = thumbUrl ? sanitizeUrlValue(toStaticProxyUrl(thumbUrl, staticProxy), 'src') : '';

  const aspectRatio =
    parseAspectRatioFromStyle(videoWrapStyle) ??
    parseAspectRatioFromStyle(thumbStyle) ??
    parseAspectRatioFromStyle(playerStyle);
  const aspectStyle = aspectRatio
    ? ` style="aspect-ratio: ${aspectRatio.toFixed(4)} / 1"`
    : '';

  const postUrl = sanitizeUrlValue(`https://t.me/${channel}/${id}`, 'href');
  if (!postUrl) {
    return '';
  }

  const thumbMarkup = proxiedThumb
    ? `<img class="video-too-big__thumb" src="${escapeHtml(proxiedThumb)}" alt="" loading="lazy" />`
    : '';

  const durationText = player.find('.message_video_duration').first().text().trim();
  const durationMarkup = durationText
    ? `<span class="video-too-big__duration">${escapeHtml(durationText)}</span>`
    : '';

  return `
    <a class="video-too-big" href="${escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer"${aspectStyle}>
      ${thumbMarkup}
      <span class="video-too-big__scrim" aria-hidden="true"></span>
      <span class="video-too-big__content">
        <span class="video-too-big__label">Media is too big</span>
        <span class="video-too-big__btn">View in Telegram</span>
      </span>
      ${durationMarkup}
    </a>
  `;
}

function getLinkPreview($: CheerioAPI, item: Element, { staticProxy, index }: ContentProcessorConfig): string {
  const link = $(item).find('.tgme_widget_message_link_preview');
  if (!link?.length) {
    return '';
  }

  const href = link.attr('href') ?? '';
  const safeHref = sanitizeUrlValue(href, 'href');
  if (!safeHref) {
    return '';
  }

  const rawTitle = $(item).find('.link_preview_title')?.text() || $(item).find('.link_preview_site_name')?.text() || safeHref;
  const rawDescription = $(item).find('.link_preview_description')?.text() || '';
  const rawSiteName = $(item).find('.link_preview_site_name')?.text() || '';

  const cleanedDescription = rawDescription.replace(/\s+/g, ' ').trim();
  const shortDescription = cleanedDescription ? truncateText(cleanedDescription, LINK_PREVIEW_DESCRIPTION_MAX_LENGTH) : '';

  let domain = '';
  try {
    const resolvedHref = safeHref.startsWith('//') ? `https:${safeHref}` : safeHref;
    domain = new URL(resolvedHref).hostname.replace(/^www\./, '');
  } catch {
    domain = '';
  }
  const metaText = rawSiteName || domain || safeHref;

  const image = $(item).find('.link_preview_image, .link_preview_right_image').first();
  const isSideImage = image.hasClass('link_preview_right_image');
  const src = extractBackgroundImage(image.attr('style') ?? '');
  const imageSrc = src ? sanitizeUrlValue(toStaticProxyUrl(src, staticProxy), 'src') : '';
  const cardClass = isSideImage ? 'bookmark-card bookmark-card--side-media' : 'bookmark-card';
  const mediaClass = isSideImage ? 'bookmark-card__media bookmark-card__media--side' : 'bookmark-card__media';

  const imageMarkup = imageSrc
    ? `<span class="${mediaClass}"><img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(rawTitle)}" loading="${getFeedImageLoading(index)}" /></span>`
    : '';
  const descriptionMarkup = shortDescription
    ? `<span class="bookmark-card__description">${escapeHtml(shortDescription)}</span>`
    : '';
  const metaMarkup = metaText ? `<span class="bookmark-card__meta">${escapeHtml(metaText)}</span>` : '';

  return `
    <a class="${cardClass}" href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">
      ${imageMarkup}
      <span class="bookmark-card__content">
        ${metaMarkup}
        <span class="bookmark-card__title">${escapeHtml(rawTitle)}</span>
        ${descriptionMarkup}
      </span>
    </a>
  `;
}

function getForwardedFrom($: CheerioAPI, item: Element): ForwardedFrom | null {
  const forwarded = $(item).find('.tgme_widget_message_forwarded_from').first();
  if (!forwarded.length) {
    return null;
  }

  const nameEl = forwarded.find('.tgme_widget_message_forwarded_from_name').first();
  const name = nameEl.text().replace(/\s+/g, ' ').trim();
  const href = nameEl.attr('href') ?? '';
  const author = forwarded
    .find('.tgme_widget_message_forwarded_from_author')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();

  let cleanedName = name;
  if (!cleanedName) {
    const fallback = forwarded.text().replace(/\s+/g, ' ').trim();
    cleanedName = fallback.replace(/^Forwarded from/i, '').trim();
  }

  if (!cleanedName) {
    return null;
  }

  return {
    name: cleanedName,
    href: href || undefined,
    author: author || undefined,
  };
}

const normalizeReplyAuthor = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().replace(/^@/, '').toLowerCase();

const shouldHideReplyAuthor = (value: string, channel?: string, channelTitle?: string): boolean => {
  const normalized = normalizeReplyAuthor(value);
  if (!normalized) return false;
  const channelNormalized = normalizeReplyAuthor(channel ?? '');
  const titleNormalized = normalizeReplyAuthor(channelTitle ?? '');
  return Boolean(
    (channelNormalized && normalized === channelNormalized) ||
    (titleNormalized && normalized === titleNormalized)
  );
};

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeReplyText = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const extractReplyTextFromHtml = (html: string): string => {
  if (!html) return '';

  const $ = cheerio.load(html);
  $('br').replaceWith('\n');

  ['p', 'div', 'li', 'blockquote'].forEach((tag) => {
    $(tag).each((_index, element) => {
      const el = $(element);
      const lastNode = el.contents().last();
      if (!lastNode.length || !lastNode.text().endsWith('\n')) {
        el.append('\n');
      }
    });
  });

  return normalizeReplyText($.root().text());
};

const getReplyMediaLabel = (reply: cheerio.Cheerio<Element>): string => {
  if (
    reply.find(
      '.tgme_widget_message_video_wrap, .tgme_widget_message_video_player, video, .message_video_duration'
    ).length
  ) {
    return 'Video';
  }

  if (
    reply.find(
      '.tgme_widget_message_reply_thumb, .tgme_widget_message_photo_wrap, .message_media_not_supported_wrap'
    ).length
  ) {
    return 'Media';
  }

  return (reply.attr('href') ?? '').trim() ? 'Link' : '';
};

const getReplyThumbnailSrc = (
  $: CheerioAPI,
  reply: cheerio.Cheerio<Element>,
  staticProxy = ''
): string => {
  const thumb = reply
    .find(
      '.tgme_widget_message_reply_thumb, .tgme_widget_message_video_thumb, .tgme_widget_message_roundvideo_thumb'
    )
    .toArray()
    .map((node) => extractBackgroundImage($(node).attr('style') ?? ''))
    .find(Boolean) ?? '';

  if (!thumb || !staticProxy) {
    return thumb;
  }

  return toStaticProxyUrl(thumb, staticProxy);
};

const stripLeadingReplyLabel = (value: string, labels: string[]): string => {
  let result = value;
  labels
    .map((label) => label.trim())
    .filter(Boolean)
    .forEach((label) => {
      const pattern = new RegExp(`^${escapeForRegExp(label)}(?:[\\s\\-–—:：]+|$)`, 'i');
      result = result.replace(pattern, '');
    });
  return result.trim();
};

function buildDetailReplyCard(
  $: CheerioAPI,
  reply: cheerio.Cheerio<Element>,
  { channel, channelTitle, hdImageBase, staticProxy }: Pick<
    ContentProcessorConfig,
    'channel' | 'channelTitle' | 'hdImageBase' | 'staticProxy'
  >
): string {
  const sourceName =
    [
      '.tgme_widget_message_author_name',
      '.tgme_widget_message_reply_author',
      '.tgme_widget_message_reply_title',
      '.tgme_widget_message_reply_name',
    ]
      .map((selector) => reply.find(selector).first().text().replace(/\s+/g, ' ').trim())
      .find(Boolean) ??
    channelTitle?.trim() ??
    '';

  const replyTextHtml =
    reply.find('.js-message_reply_text, .tgme_widget_message_reply_text').first().html() ?? '';
  const rawReplyHtml = reply.html() ?? '';
  let text = extractReplyTextFromHtml(replyTextHtml || rawReplyHtml);
  text = stripLeadingReplyLabel(text, [sourceName, channelTitle ?? '', channel ?? '']);
  const replyMediaLabel = getReplyMediaLabel(reply);
  const hasInlineReplyMediaPreview = /^(media|video)$/i.test(replyMediaLabel);

  if (!text) {
    text = replyMediaLabel;
  }

  if (!text) {
    return '';
  }

  let href = reply.attr('href') ?? '';
  if (href && channel) {
    try {
      const url = new URL(href, 'https://t.me');
      href = `${url.pathname}`.replace(new RegExp(`/${channel}/`, 'i'), '/mood/');
    } catch {
      href = '';
    }
  }

  const safeHref = sanitizeUrlValue(href, 'href');
  const replyTargetId = (() => {
    if (!safeHref) return '';
    try {
      const url = new URL(safeHref, 'https://local.invalid');
      const match = url.pathname.match(/^\/mood\/(\d+)$/);
      return match?.[1] ?? '';
    } catch {
      return '';
    }
  })();
  const inlineReplyThumb = hasInlineReplyMediaPreview
    ? sanitizeUrlValue(getReplyThumbnailSrc($, reply, staticProxy), 'src')
    : '';
  const replyPreviewSrc =
    inlineReplyThumb ||
    (hasInlineReplyMediaPreview && replyTargetId && hdImageBase
      ? sanitizeUrlValue(buildHdImageUrl(hdImageBase, `/mood/${encodeURIComponent(replyTargetId)}/0`), 'src')
      : '');
  const tagName = safeHref ? 'a' : 'div';
  const hrefAttr = safeHref ? ` href="${escapeHtml(safeHref)}"` : '';
  const externalAttrs = safeHref && /^https?:\/\//i.test(safeHref)
    ? ' target="_blank" rel="noopener noreferrer"'
    : '';
  const isLocalMoodQuote = safeHref.startsWith('/mood/');
  const sourceMarkup = sourceName && !isLocalMoodQuote
    ? `<div class="mood-detail-quote-meta mood-item-quote-meta"><span class="mood-detail-quote-source mood-item-quote-author">${escapeHtml(sourceName)}</span></div>`
    : '';
  const previewMarkup = replyPreviewSrc
    ? `<span class="mood-detail-quote-media mood-item-quote-media"><img class="mood-detail-quote-image mood-item-quote-image" src="${escapeHtml(replyPreviewSrc)}" alt="" loading="lazy" onerror="${escapeHtml(QUOTE_IMAGE_ERROR_HANDLER)}" /></span>`
    : '';
  const isMediaOnlyQuote = Boolean(replyPreviewSrc && /^(media|video)$/i.test(text));
  const textMarkup =
    isMediaOnlyQuote
      ? ''
      : `<p class="mood-detail-quote-text mood-item-quote-text">${escapeHtml(text)}</p>`;
  const bodyMarkup = sourceMarkup || textMarkup
    ? `<span class="mood-detail-quote-body mood-item-quote-body">${sourceMarkup}${textMarkup}</span>`
    : '';
  const quoteClassName = [
    'mood-detail-quote',
    'mood-item-quote',
    'mood-comment-quote',
    isMediaOnlyQuote ? 'mood-detail-quote--media-only mood-item-quote--media-only' : '',
    replyPreviewSrc && !isMediaOnlyQuote ? 'mood-detail-quote--with-media mood-item-quote--with-media' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<${tagName} class="${quoteClassName}"${hrefAttr}${externalAttrs}>${previewMarkup}${bodyMarkup}</${tagName}>`;
}

function sanitizeUrlValue(value: string, type: 'href' | 'src'): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('?')
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const allowedProtocols = type === 'href'
      ? new Set(['http:', 'https:', 'mailto:', 'tel:'])
      : new Set(['http:', 'https:']);
    return allowedProtocols.has(parsed.protocol) ? trimmed : '';
  } catch {
    return '';
  }
}

function sanitizeSrcSet(value: string): string {
  return value
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return '';
      const [rawUrl, ...descriptors] = trimmed.split(/\s+/);
      if (!rawUrl) return '';
      const safeUrl = sanitizeUrlValue(rawUrl, 'src');
      if (!safeUrl) return '';
      return [safeUrl, ...descriptors].join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function getReply(
  $: CheerioAPI,
  item: Element,
  { channel, channelTitle, hdImageBase, staticProxy, replyVariant = 'raw' }: ContentProcessorConfig
): string {
  const reply = $(item).find('.tgme_widget_message_reply').first();
  if (!reply.length) return '';

  if (replyVariant === 'detail-card') {
    return buildDetailReplyCard($, reply, { channel, channelTitle, hdImageBase, staticProxy });
  }

  const authorSelectors = [
    '.tgme_widget_message_reply_author',
    '.tgme_widget_message_reply_title',
    '.tgme_widget_message_reply_name',
  ];

  authorSelectors.forEach((selector) => {
    const authorEl = reply.find(selector).first();
    if (!authorEl.length) return;
    const authorText = authorEl.text().replace(/\s+/g, ' ').trim();
    if (shouldHideReplyAuthor(authorText, channel, channelTitle)) {
      authorEl.remove();
    }
  });
  reply.wrapInner('<small></small>').wrapInner('<blockquote></blockquote>');

  const href = reply.attr('href');
  if (href && channel) {
    try {
      const url = new URL(href, 'https://t.me');
      reply.attr('href', `${url.pathname}`.replace(new RegExp(`/${channel}/`, 'i'), '/mood/'));
    } catch {
      reply.removeAttr('href');
    }
  }

  reply.find('*').each((_index, element) => {
    const el = $(element);
    const attrs = Object.keys((element as any).attribs ?? {});
    attrs.forEach((attr) => {
      if (attr.toLowerCase().startsWith('on')) {
        el.removeAttr(attr);
      }
    });
  });

  const replyHref = reply.attr('href') ?? '';
  const safeReplyHref = sanitizeUrlValue(replyHref, 'href');
  if (safeReplyHref) {
    reply.attr('href', safeReplyHref);
  } else {
    reply.removeAttr('href');
  }

  return $.html(reply);
}

async function modifyHTMLContent(
  $: CheerioAPI,
  content: any,
  { index, staticProxy }: { index?: number; staticProxy?: string } = {}
): Promise<any> {
  await hydrateTgEmoji($, content, { staticProxy });
  $(content).find('script, style, iframe, object, embed, link, meta').remove();
  $(content).find('.emoji')?.removeAttr('style');
  $(content)
    .find('a')
    ?.each((_index, a) => {
      $(a)?.attr('title', $(a)?.text())?.removeAttr('onclick');
    });
  $(content)
    .find('tg-spoiler')
    ?.each((_index, spoiler) => {
      const id = `spoiler-${index}-${_index}`;
      $(spoiler)
        ?.attr('id', id)
        ?.wrap('<label class="spoiler-button"></label>')
        ?.before(`<input type="checkbox" />`);
    });
  $(content)
    .find('pre')
    .each((_index, pre) => {
      try {
        $(pre).find('br')?.replaceWith('\n');

        const code = $(pre).text();
        const language = (flourite(code, { shiki: true, noUnknown: true }) as any)?.language || 'text';
        const highlightedCode = Prism.highlight(code, Prism.languages[language] || Prism.languages.text, language);
        $(pre).html(`<code class="language-${language}">${highlightedCode}</code>`);
      } catch (error) {
        console.error(error);
      }
    });

  $(content)
    .find('*')
    .each((_index, element) => {
      const el = $(element);
      const attrs = Object.keys((element as any).attribs ?? {});

      attrs.forEach((attr) => {
        const attrLower = attr.toLowerCase();
        const rawValue = el.attr(attr) ?? '';

        if (attrLower.startsWith('on')) {
          el.removeAttr(attr);
          return;
        }

        if (attrLower === 'style') {
          el.removeAttr(attr);
          return;
        }

        if (attrLower === 'href') {
          const safeHref = sanitizeUrlValue(rawValue, 'href');
          if (safeHref) {
            el.attr(attr, safeHref);
          } else {
            el.removeAttr(attr);
          }
          return;
        }

        if (attrLower === 'src' || attrLower === 'poster') {
          const safeSrc = sanitizeUrlValue(rawValue, 'src');
          if (safeSrc) {
            el.attr(attr, safeSrc);
          } else {
            el.removeAttr(attr);
          }
          return;
        }

        if (attrLower === 'srcset') {
          const safeSrcSet = sanitizeSrcSet(rawValue);
          if (safeSrcSet) {
            el.attr(attr, safeSrcSet);
          } else {
            el.removeAttr(attr);
          }
        }
      });

      if (el.is('a')) {
        const href = el.attr('href') ?? '';
        if (!href) {
          el.replaceWith(el.text());
          return;
        }

        if (/^https?:/i.test(href)) {
          el.attr('target', '_blank');
          el.attr('rel', 'noopener noreferrer');
        } else {
          el.removeAttr('target');
          el.removeAttr('rel');
        }
      }
    });

  return content;
}

// Normalize emoji variants (e.g., ❤ → ❤️)
function normalizeEmoji(emoji: string): string {
  const emojiMap: Record<string, string> = {
    '❤': '❤️',
    '☺': '☺️',
    '☹': '☹️',
    '♥': '❤️',
  };
  return emojiMap[emoji] || emoji;
}

async function getCustomEmojiImage(emojiId: string, staticProxy = ''): Promise<string | null> {
  if (!emojiId) return null;
  const imageUrl = `https://t.me/i/emoji/${emojiId}.webp`;
  const proxy = staticProxy || '/static/';
  return toStaticProxyUrl(imageUrl, proxy);
}

async function hydrateTgEmoji(
  $: CheerioAPI,
  content: any,
  { staticProxy }: { staticProxy?: string } = {}
): Promise<void> {
  const emojiNodes = $(content).find('tg-emoji')?.toArray() ?? [];
  if (!emojiNodes.length) return;

  await Promise.all(
    emojiNodes.map(async (emojiEl) => {
      const emojiId = ($(emojiEl).attr('emoji-id') ?? '').replace(/[^0-9]/g, '');
      const fallbackText = ($(emojiEl).text() ?? '').trim();
      if (!emojiId && !fallbackText) return;

      const imageUrl = emojiId ? await getCustomEmojiImage(emojiId, staticProxy ?? '') : null;
      const safeFallback = fallbackText ? escapeHtml(fallbackText) : '';
      const altText = escapeHtml(fallbackText || 'emoji');
      const dataAttr = emojiId ? ` data-emoji-id="${emojiId}"` : '';
      const labelAttr = fallbackText ? ` aria-label="${safeFallback}"` : '';
      const fallbackMarkup = imageUrl
        ? `<img class="tg-emoji-fallback" src="${imageUrl}" alt="${altText}" loading="lazy" />`
        : safeFallback;
      const wrapper = `<span class="tg-emoji"${dataAttr}${labelAttr}>${fallbackMarkup}</span>`;
      $(emojiEl).replaceWith(wrapper);
    })
  );
}

/**
 * Extract comments count from post embed
 */
async function getCommentsCount(
  $: CheerioAPI,
  item: Element,
  {
    channel,
    host = 't.me',
    headers = {},
    postId,
  }: { channel?: string; host?: string; headers?: Record<string, string>; postId?: string } = {}
): Promise<number> {
  // Telegram shows replies/comments in .tgme_widget_message_replies or similar elements
  const repliesEl = $(item).find('.tgme_widget_message_replies, .tgme_widget_message_comments');
  if (repliesEl.length) {
    // Try to extract count from the text content (e.g., "12 comments", "3 replies")
    const text = repliesEl.text().trim();
    const match = text.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    // Fallback: check data attributes
    const dataCount = repliesEl.attr('data-count') || repliesEl.attr('data-replies');
    if (dataCount) {
      const parsed = parseInt(dataCount, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }

  if (!channel || !postId) return 0;

  const cacheKey = `${channel}/${postId}`;
  const cached = commentsCountCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const url = `https://${host}/${channel}/${postId}?embed=1&discussion=1&comments_limit=1`;
    const html = await $fetch<string>(url, {
      headers,
      retry: 2,
      retryDelay: 100,
    });
    const $discussion = cheerio.load(html, {}, false);
    const headerText =
      $discussion('.tgme_post_discussion_header .js-header').first().text().trim();
    const match = headerText.match(/(\d+)/);
    const count = match ? parseInt(match[1], 10) : 0;
    commentsCountCache.set(cacheKey, count);
    return count;
  } catch (error) {
    console.error('Failed to fetch comments count:', error);
    return 0;
  }
}

async function getReactions($: CheerioAPI, item: Element, staticProxy: string): Promise<Reaction[]> {
  const reactions: Reaction[] = [];
  const reactionNodes = $(item).find('.tgme_widget_message_reactions .tgme_reaction').toArray();

  for (const reaction of reactionNodes) {
    const isPaid = $(reaction).hasClass('tgme_reaction_paid');
    let emoji = '';
    let emojiId: string | undefined;
    let emojiImage: string | undefined;

    // Check for standard emoji in <i class="emoji"><b>emoji</b></i>
    const standardEmoji = $(reaction).find('.emoji b');
    if (standardEmoji.length) {
      emoji = normalizeEmoji(standardEmoji.text().trim());
    }

    // Check for custom tg-emoji
    const tgEmoji = $(reaction).find('tg-emoji');
    if (tgEmoji.length && !emoji) {
      emojiId = tgEmoji.attr('emoji-id');
      if (emojiId) {
        const imageUrl = await getCustomEmojiImage(emojiId, staticProxy);
        if (imageUrl) {
          emojiImage = imageUrl;
        }
      }
    }

    // For paid reactions, use star emoji
    if (isPaid && !emoji && !emojiImage) {
      emoji = '⭐';
    }

    // Extract count - get text content and remove emoji
    const clone = $(reaction).clone();
    clone.find('.emoji, tg-emoji, i').remove();
    const count = clone.text().trim();

    if (count) {
      reactions.push({
        emoji,
        emojiId,
        emojiImage,
        count,
        isPaid,
      });
    }
  }

  return reactions;
}

async function getPost(
  $: CheerioAPI,
  item: Element | null,
  {
    channel,
    channelTitle,
    staticProxy,
    hdImageBase,
    index = 0,
    host,
    headers,
    replyVariant = 'raw',
    lazyVideo = false,
  }: ContentProcessorConfig & { channel: string }
): Promise<Post> {
  const messageItem = item ? $(item).find('.tgme_widget_message') : $('.tgme_widget_message');
  const messageElement = messageItem.get(0) ?? item;
  if (!messageElement) {
    throw new Error('Message element not found');
  }
  const content =
    $(messageItem).find('.js-message_reply_text')?.length > 0
      ? await modifyHTMLContent($, $(messageItem).find('.tgme_widget_message_text.js-message_text'), {
          index,
          staticProxy,
        })
      : await modifyHTMLContent($, $(messageItem).find('.tgme_widget_message_text'), { index, staticProxy });
  const title = content?.text()?.match(/^.*?(?=[。\n]|http\S)/g)?.[0] ?? content?.text() ?? '';
  const id = $(messageItem).attr('data-post')?.replace(new RegExp(`${channel}/`, 'i'), '') ?? '';

  const tags =
    $(content)
      .find('a[href^="?q="]')
      ?.each((_index, a) => {
        $(a)?.attr('href', `/mood?tag=${encodeURIComponent($(a)?.text() ?? '')}`);
      })
      ?.map((_index, a) => $(a)?.text()?.replace('#', '') ?? '')
      ?.get() ?? [];
  const forwardedFrom = getForwardedFrom($, messageElement);

  return {
    id,
    title,
    type: $(messageElement).attr('class')?.includes('service_message') ? 'service' : 'text',
    datetime: $(messageElement).find('.tgme_widget_message_date time')?.attr('datetime') ?? '',
    tags,
    text: content?.text() ?? '',
    content: [
      getReply($, messageElement, {
        channel,
        channelTitle,
        hdImageBase,
        staticProxy,
        replyVariant,
      }),
      getImages($, messageElement, { staticProxy, hdImageBase, id, index, title }),
      await getUnsupportedMediaFallback($, messageElement, { staticProxy, hdImageBase, id, index, title, channel }),
      getVideo($, messageElement, { staticProxy, index, lazyVideo }),
      getAudio($, messageElement, { staticProxy }),
      content?.html(),
      getImageStickers($, messageElement, { staticProxy, index }),
      getVideoStickers($, messageElement, { staticProxy, index, lazyVideo }),
      $(messageElement).find('.tgme_widget_message_poll')?.html(),
      $.html($(messageElement).find('.tgme_widget_message_document_wrap')),
      getNotSupportedVideo($, messageElement, { staticProxy, channel, id }),
      $.html($(messageElement).find('.tgme_widget_message_location_wrap')),
      getLinkPreview($, messageElement, { staticProxy, index }),
    ]
      .filter(Boolean)
      .join('')
      .replace(/(url\(["'])((https?:)?\/\/)/g, (match, p1, p2, _p3, offset, source) => {
        if (p2 === '//') {
          p2 = 'https://';
        }
        if (shouldKeepExternalCssUrl(source, offset + match.length)) {
          return match;
        }
        return `${p1}${toStaticProxyUrl(p2, staticProxy)}`;
      }),
    forwardedFrom: forwardedFrom ?? undefined,
    reactions: await getReactions($, messageElement, staticProxy),
    commentsCount: await getCommentsCount($, messageElement, {
      channel,
      host,
      headers,
      postId: id,
    }),
  };
}

/**
 * Parse a single comment from Telegram discussion embed
 */
async function parseComment(
  $: CheerioAPI,
  item: Element,
  { staticProxy, channel, channelTitle }: ContentProcessorConfig
): Promise<Comment | null> {
  const messageEl = $(item).find('.tgme_widget_message').first();
  if (!messageEl.length) return null;

  const rawId = messageEl.attr('data-post-id') || messageEl.attr('data-post') || '';
  const id = rawId.split('/').pop() ?? '';
  if (!id) return null;

  // Get author info
  const authorEl = messageEl.find('.tgme_widget_message_author_name').first();
  const author = authorEl.text().replace(/\s+/g, ' ').trim() || 'Anonymous';

  // Get author avatar
  const avatarImg = messageEl.find('.tgme_widget_message_user_photo img').attr('src') ?? '';
  const avatarStyle = messageEl.find('.tgme_widget_message_user_photo').attr('style') ?? '';
  const avatarMatch = avatarStyle.match(/url\(['"]?(.*?)['"]?\)/);
  const rawAvatar = avatarImg || avatarMatch?.[1] || '';
  const authorAvatar = rawAvatar ? toStaticProxyUrl(rawAvatar, staticProxy) : undefined;

  // Get datetime
  const datetime = messageEl.find('.tgme_widget_message_date time').attr('datetime') ?? '';

  const replyEl = messageEl.find('.tgme_widget_message_reply').first();
  if (replyEl.length) {
    await modifyHTMLContent($, replyEl, { staticProxy });
  }
  const replyHtml = getReply($, messageEl.get(0) as Element, { channel, channelTitle, staticProxy });

  // Get content (prefer actual message text over reply preview)
  let contentEl = messageEl.find('.tgme_widget_message_text.js-message_text').first();
  if (!contentEl.length) {
    contentEl = messageEl
      .find('.tgme_widget_message_text')
      .filter((_index, el) => {
        const element = $(el);
        return (
          !element.hasClass('js-message_reply_text') &&
          !element.closest('.tgme_widget_message_reply').length &&
          !element.closest('.tgme_widget_message_reply_template').length
        );
      })
      .first();
  }
  await modifyHTMLContent($, contentEl, { staticProxy });

  const mediaHtml = [
    getImages($, messageEl.get(0) as Element, { staticProxy, id, title: author }),
    getVideo($, messageEl.get(0) as Element, { staticProxy }),
    getAudio($, messageEl.get(0) as Element, { staticProxy }),
    $.html(messageEl.find('.tgme_widget_message_document_wrap')),
    getNotSupportedVideo($, messageEl.get(0) as Element, { staticProxy, channel, id }),
  ].filter(Boolean).join('');

  // Extract stickers from comments (same as posts)
  const stickersHtml = [
    getImageStickers($, messageEl.get(0) as Element, { staticProxy }),
    getVideoStickers($, messageEl.get(0) as Element, { staticProxy }),
  ].filter(Boolean).join('');

  const content = [replyHtml, mediaHtml, contentEl.html() ?? '', stickersHtml].filter(Boolean).join('');

  // Get reactions
  const reactions = await getReactions($, messageEl.get(0) as Element, staticProxy);

  return {
    id,
    author,
    authorAvatar,
    datetime,
    content,
    reactions,
  };
}

/**
 * Fetch comments for a specific post from Telegram discussion
 */
export async function getPostComments(
  Astro: any,
  { postId, before = '' }: { postId: string; before?: string }
): Promise<{ comments: Comment[]; hasMore: boolean; nextBefore?: string }> {
  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') || 't.me';
  const channel = getEnv(import.meta.env, Astro, 'CHANNEL');
  const staticProxy = '/static/';

  // Telegram exposes comments via the discussion embed endpoint
  const url = `https://${host}/${channel}/${postId}?embed=1&discussion=1&comments_limit=20`;
  const headers = buildTelegramRequestHeaders(Astro.request);

  try {
    const html = await $fetch<string>(url, {
      headers,
      query: before ? { before } : undefined,
      retry: 2,
      retryDelay: 100,
    });

    const $ = cheerio.load(html, {}, false);

    // Find all comment messages in the discussion
    const commentNodes = $('.tgme_widget_message_wrap').toArray();
    const comments: Comment[] = [];

    for (const node of commentNodes) {
      const comment = await parseComment($, node, { staticProxy, channel });
      if (comment) {
        comments.push(comment);
      }
    }

    // Check if there are more comments (pagination)
    const moreEl = $('.tgme_widget_message_more').first();
    const hasMore = moreEl.length > 0;
    let nextBefore = '';

    if (hasMore) {
      const dataBefore = moreEl.attr('data-before') ?? '';
      const href = moreEl.attr('href') ?? '';
      nextBefore = dataBefore;

      if (!nextBefore && href) {
        try {
          const parsed = new URL(href, `https://${host}`);
          nextBefore = parsed.searchParams.get('before') ?? '';
        } catch {
          const match = href.match(/before=(\d+)/);
          nextBefore = match?.[1] ?? '';
        }
      }
    }

    return { comments, hasMore, nextBefore };
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return { comments: [], hasMore: false, nextBefore: '' };
  }
}

export async function getChannelInfo(
  Astro: any,
  {
    before = '',
    after = '',
    q = '',
    type = 'list',
    id = '',
    skipCache = false,
  }: { before?: string; after?: string; q?: string; type?: string; id?: string; skipCache?: boolean } = {}
): Promise<ChannelInfo | Post> {
  const cacheKey = JSON.stringify({ before, after, q, type, id, version: TELEGRAM_PARSE_CACHE_VERSION });

  if (!skipCache) {
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      return JSON.parse(JSON.stringify(cachedResult));
    }
  }

  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') || 't.me';
  const channel = getEnv(import.meta.env, Astro, 'CHANNEL');
  const hdImageBase = normalizeMoodImageBase(getEnv(import.meta.env, Astro, 'PUBLIC_HD_IMAGE_URL'));
  // Always use local static proxy for Telegram media
  const staticProxy = '/static/';

  const url = id ? `https://${host}/${channel}/${id}?embed=1&mode=tme` : `https://${host}/s/${channel}`;
  const headers = buildTelegramRequestHeaders(Astro.request);

  // Cross-isolate edge cache for the raw t.me HTML. The in-memory LRU above is
  // per-isolate, so every cold isolate paid the full ~3s t.me round-trip — which
  // is ~65% of the mood LCP. caches.default is shared across isolates at the edge,
  // so a warm entry lets cold isolates skip the round-trip. Everything here is
  // best-effort and fail-safe: any miss or error falls through to a live fetch.
  const edgeCache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const edgeCacheRequest = edgeCache
    ? new Request(`https://mood-edge-cache.internal/tg?${new URLSearchParams({
        u: url, before, after, q, type, id, v: TELEGRAM_PARSE_CACHE_VERSION,
      }).toString()}`)
    : null;

  let html: string | undefined;
  if (edgeCache && edgeCacheRequest && !skipCache) {
    try {
      const hit = await edgeCache.match(edgeCacheRequest);
      if (hit) html = await hit.text();
    } catch {
      // Edge cache unavailable — fall through to a live fetch.
    }
  }

  if (typeof html !== 'string') {
    // Cap the upstream wait: an unbounded fetch (retry: 3, no timeout) lets a slow
    // t.me response block the SSR document for seconds, which was the mood LCP tail.
    // On timeout the caller falls back to the client-rendered skeleton path.
    html = await $fetch<string>(url, {
      headers,
      query: {
        before: before || undefined,
        after: after || undefined,
        q: q || undefined,
      },
      retry: 1,
      retryDelay: 100,
      timeout: 3000,
    });

    // Populate the edge cache. 60s TTL is fresher than the 5min per-isolate parse
    // cache; the client update-watcher still surfaces newer posts after that.
    if (edgeCache && edgeCacheRequest && !skipCache && html) {
      try {
        await edgeCache.put(
          edgeCacheRequest,
          new Response(html, { headers: { 'Cache-Control': 'public, max-age=60' } }),
        );
      } catch {
        // Best-effort: a failed put just means the next isolate refetches.
      }
    }
  }

  const $ = cheerio.load(html, {}, false);
  const channelTitle = $('.tgme_channel_info_header_title')?.text() ?? '';
  if (id) {
    let post = await getPost($, null, {
      channel,
      channelTitle,
      staticProxy,
      hdImageBase,
      host,
      headers,
      replyVariant: 'detail-card',
    });
    post = await enrichDetailPost(post, {
      host,
      channel,
      headers,
      hdImageBase,
      currentEmbedState: parseTelegramEmbedState(html),
    });
    if (!skipCache) {
      cache.set(cacheKey, post);
    }
    return post;
  }
  const posts =
    (await Promise.all(
      $('.tgme_channel_history  .tgme_widget_message_wrap')
        ?.map((index, item) => {
          return getPost($, item, { channel, channelTitle, staticProxy, hdImageBase, index, host, headers, lazyVideo: true });
        })
        ?.get() ?? []
    ))
      ?.reverse()
      .filter((post: Post) => ['text'].includes(post.type) && post.id && post.content) ?? [];

  const rawAvatar = $('.tgme_page_photo_image img')?.attr('src') ?? '';
  const channelInfo: ChannelInfo = {
    posts,
    title: channelTitle,
    titleHTML: (await modifyHTMLContent($, $('.tgme_channel_info_header_title'), { staticProxy }))?.html() ?? '',
    description: $('.tgme_channel_info_description')?.text() ?? '',
    descriptionHTML: (await modifyHTMLContent($, $('.tgme_channel_info_description'), { staticProxy }))?.html() ?? '',
    avatar: buildHdImageUrl(hdImageBase, '/channel/avatar') || rawAvatar,
  };

  if (!skipCache) {
    cache.set(cacheKey, channelInfo);
  }
  return channelInfo;
}
