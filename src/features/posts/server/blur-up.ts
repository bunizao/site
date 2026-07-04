// Blur-up (LQIP) enrichment, run at build time from getStaticPaths.
//
// For each content image we fetch the source once, downscale it to a ~24px
// blurred WebP, and inline that as a base64 data URI on a wrapper. The real
// <img> then crossfades in on load (Prose.astro toggles `.is-loaded`), so the
// reader sees a soft preview that sharpens — never a blank box that shifts the
// layout. Because the blog is prerendered, all of this is paid for at build,
// not per request, and ships no extra network round-trips to the reader.
//
// Resilient by design: any fetch/decode failure leaves the original tag intact
// (no LQIP, just the plain image), and results are cached per build so a repeated
// URL is fetched once and a broken URL is not retried.

import { BLOG_IMAGE_PROXY_PREFIX } from '../adapter/ghost/dataset';
import { buildSrcSet, withWidthParam } from '@/lib/media/responsive-image';

const LQIP_WIDTH = 24; // tiny on purpose — keeps the inlined data URI small
const FETCH_TIMEOUT_MS = 8000;
const isDev = import.meta.env.DEV || process.env.NODE_ENV === 'development';

// The Ghost adapter rewrites content images to proxy-relative URLs
// (/api/v2/images/blog/...), which a build-time fetch can't reach on its own.
// Resolve them against production, and probe a small width variant — the LQIP
// only needs pixels and the aspect ratio survives downscaling, so there is no
// reason to pull multi-MB originals on every build.
const BLOG_PROXY_ORIGIN = 'https://buxx.me';
const PROBE_WIDTH = 640;

interface ImageMeta {
  lqip: string;
  width: number;
  height: number;
}

// Per-build memo: dedupe duplicate URLs and negative-cache failures.
const cache = new Map<string, ImageMeta | null>();

async function probe(src: string): Promise<ImageMeta | null> {
  if (isDev) return null;

  // Only raster images we can reach at build are worth blurring: remote URLs
  // and proxy-relative blog images. Skip data URIs, local mock assets, and
  // vector SVGs (no blur-up to gain).
  const isProxyRelative = src.startsWith(BLOG_IMAGE_PROXY_PREFIX);
  if ((!/^https?:\/\//i.test(src) && !isProxyRelative) || /\.svg(?:[?#]|$)/i.test(src)) {
    return null;
  }
  if (cache.has(src)) return cache.get(src) ?? null;

  const fetchUrl = isProxyRelative
    ? new URL(withWidthParam(src, PROBE_WIDTH), BLOG_PROXY_ORIGIN).href
    : src;

  let result: ImageMeta | null = null;
  try {
    const { default: sharp } = await import('sharp');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`fetch ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const image = sharp(buffer, { animated: false });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) throw new Error('missing dimensions');

    const tiny = await image
      .resize(LQIP_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
      .blur() // soften so the upscale to full size stays smooth
      .webp({ quality: 40 })
      .toBuffer();

    result = {
      lqip: `data:image/webp;base64,${tiny.toString('base64')}`,
      width: meta.width,
      height: meta.height,
    };
  } catch {
    result = null; // leave the original tag untouched downstream
  }

  cache.set(src, result);
  return result;
}

// --- attribute helpers (the HTML is trusted Ghost output, regex is enough) ---
function getAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

// Build the wrapped, blur-ready markup for a single <img> tag. `aspect-ratio`
// goes on the <img> so it reserves the right box before load (no layout shift);
// the wrapper carries the blurred preview as a CSS custom property.
function wrapImage(imgTag: string, meta: ImageMeta): string {
  const ratio = `${meta.width} / ${meta.height}`;
  const style = `aspect-ratio:${ratio}`;
  // Merge our aspect-ratio into any existing style without clobbering it.
  const existing = getAttr(imgTag, 'style');
  const withStyle = existing
    ? imgTag.replace(/\bstyle="([^"]*)"/i, `style="$1;${style}"`)
    : imgTag.replace(/<img\b/i, `<img style="${style}"`);

  return (
    `<span class="blog-media is-blur" style="--lqip:url('${meta.lqip}')">` +
    `${withStyle}</span>`
  );
}

async function replaceAsync(
  html: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  const matches = [...html.matchAll(pattern)];
  if (matches.length === 0) return html;
  const replacements = await Promise.all(matches.map((m) => replacer(m)));
  let out = '';
  let last = 0;
  matches.forEach((m, i) => {
    out += html.slice(last, m.index) + replacements[i];
    last = m.index! + m[0].length;
  });
  return out + html.slice(last);
}

// Match the two content-image shapes Ghost emits. We deliberately do NOT touch
// bookmark icons, link-card thumbnails, or Apple Music artwork — only the
// images a reader actually waits on.
const SINGLE_IMAGE_RE = /<img\b[^>]*\bclass="[^"]*\bkg-image\b[^"]*"[^>]*>/gi;
const GALLERY_IMAGE_RE = /<div class="kg-gallery-image">\s*(<img\b[^>]*>)\s*<\/div>/gi;
const VIDEO_CARD_RE = /<figure\b[^>]*\bkg-video-card\b[\s\S]*?<\/figure>/gi;

// Add (or merge) an inline style fragment onto a tag.
function addStyle(tag: string, fragment: string): string {
  const existing = getAttr(tag, 'style');
  return existing
    ? tag.replace(/\bstyle="([^"]*)"/i, `style="$1;${fragment}"`)
    : tag.replace(/<(\w+)\b/i, `<$1 style="${fragment}"`);
}

// The reading column is 920px at most; on phones the image spans the viewport
// minus the shell padding. Content images ship from Ghost at full capture size
// (2560px), so without a srcset a phone downloads ~8x the pixels it can show.
const CONTENT_IMAGE_WIDTHS = [640, 960, 1200, 1600] as const;
const CONTENT_IMAGE_SIZES = '(min-width: 960px) 920px, calc(100vw - 40px)';
const CONTENT_IMAGE_DEFAULT_WIDTH = 1200;

// Give a proxy-served content image width variants. The lightbox zoom still
// reaches the original through `currentSrc`'s largest variant, which is plenty
// beyond the column width. Images already carrying a srcset (e.g. Ghost size
// variants) are left alone.
function addResponsiveWidths(imgTag: string): string {
  const src = getAttr(imgTag, 'src');
  if (!src || !src.startsWith(BLOG_IMAGE_PROXY_PREFIX)) return imgTag;
  if (/\bsrcset=/i.test(imgTag) || /\.svg(?:[?#]|$)/i.test(src)) return imgTag;

  // Cap variants at the intrinsic width Ghost recorded, so we never ask the
  // proxy to upscale. Without a width attribute, trust the standard ladder.
  const intrinsic = Number(getAttr(imgTag, 'width')) || null;
  const widths = CONTENT_IMAGE_WIDTHS.filter((w) => !intrinsic || w <= intrinsic);
  if (widths.length === 0) return imgTag; // already smaller than our smallest variant

  // Keep the untouched original around for the lightbox: on a phone the chosen
  // variant may be 640px, but a pinch-zoom deserves the full asset.
  const fallback = Math.min(CONTENT_IMAGE_DEFAULT_WIDTH, widths[widths.length - 1]);
  return imgTag.replace(
    /\bsrc="[^"]*"/i,
    `src="${withWidthParam(src, fallback)}" srcset="${buildSrcSet(src, widths)}" sizes="${CONTENT_IMAGE_SIZES}" data-zoom-src="${src}"`,
  );
}

// Set (or replace) a plain string attribute on a tag.
function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`\\b${name}(="[^"]*")?`, 'i');
  return re.test(tag)
    ? tag.replace(re, `${name}="${value}"`)
    : tag.replace(/<(\w+)\b/i, `<$1 ${name}="${value}"`);
}

// Video cards: make the <video> cheap until the reader reaches it, and reserve
// its box so nothing shifts.
//
// Ghost ships ambient loops as `autoplay` + `preload="metadata"`, which makes
// the browser start pulling every mp4 at page load — tens of MB before the
// reader has scrolled at all. At build we swap that for a real poster +
// `preload="none"`, and demote `autoplay` to `data-blog-autoplay`; Prose.astro
// plays/pauses those loops with an IntersectionObserver, so the animation is
// identical once the card is on screen but costs nothing before that (and
// off-screen loops stop burning CPU).
//
// (Some thumbnails live under a literal ".../undefined/..." path — a Ghost
// upload bug — but that IS where the file is served from; leave them alone.)
async function enrichVideoCards(html: string): Promise<string> {
  return replaceAsync(html, VIDEO_CARD_RE, async (match) => {
    const figure = match[0];
    const videoMatch = figure.match(/<video\b[^>]*>/i);
    if (!videoMatch) return figure;

    const thumb =
      getAttr(figure, 'data-kg-thumbnail') || getAttr(figure, 'data-kg-custom-thumbnail');
    const meta = thumb ? await probe(thumb) : null;

    let video = videoMatch[0];

    // Prefer the video's own dimensions for the ratio; fall back to the thumb.
    const vw = Number(getAttr(video, 'width')) || meta?.width;
    const vh = Number(getAttr(video, 'height')) || meta?.height;
    if (vw && vh) video = addStyle(video, `aspect-ratio:${vw} / ${vh}`);
    // The `--lqip` custom property is the CSS hook (no class juggling needed).
    if (meta) video = addStyle(video, `--lqip:url('${meta.lqip}')`);

    // A poster attribute downloads at parse time, so even the thumbnail waits
    // for the IntersectionObserver: the inlined `--lqip` blur paints the slot
    // instantly, Prose.astro promotes data-blog-poster to the real poster as
    // the card approaches. Ghost's spacer-gif poster (a third-party request)
    // and its eager background thumbnail both go away.
    video = video.replace(/\s*\bposter="[^"]*"/i, '');
    video = video.replace(/background:\s*transparent\s*url\([^)]*\)[^;"]*;?/i, '');
    if (thumb) video = setAttr(video, 'data-blog-poster', thumb);
    video = setAttr(video, 'preload', 'none');
    if (/\bautoplay\b/i.test(video)) {
      video = video.replace(/\s*\bautoplay(="[^"]*")?/i, '');
      video = setAttr(video, 'data-blog-autoplay', 'true');
    }

    return figure.replace(videoMatch[0], video);
  });
}

/**
 * Rewrite content images into blur-up wrappers with an inlined LQIP preview.
 * Falls back to the untouched tag for anything we can't fetch or decode.
 */
export async function enrichBlurUp(html: string): Promise<string> {
  // Single image cards (`<img class="kg-image" ...>`).
  let out = await replaceAsync(html, SINGLE_IMAGE_RE, async (match) => {
    const src = getAttr(match[0], 'src');
    if (!src) return match[0];
    const tag = addResponsiveWidths(match[0]);
    const meta = await probe(src);
    return meta ? wrapImage(tag, meta) : tag;
  });

  // Gallery cells (`<div class="kg-gallery-image"><img ...></div>`).
  out = await replaceAsync(out, GALLERY_IMAGE_RE, async (match) => {
    const src = getAttr(match[1], 'src');
    if (!src) return match[0];
    const tag = addResponsiveWidths(match[1]);
    const meta = await probe(src);
    return `<div class="kg-gallery-image">${meta ? wrapImage(tag, meta) : tag}</div>`;
  });

  // Video cards: blurred poster preview + reserved aspect ratio.
  out = await enrichVideoCards(out);

  return out;
}

/** LQIP for a standalone image (e.g. the post feature image). */
export async function getBlurUp(src: string): Promise<ImageMeta | null> {
  return probe(src);
}
