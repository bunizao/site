import {
  parseYouTubeVideoUrl,
  renderYouTubeEmbedMarkup,
  youtubeWatchUrl,
} from '@/lib/embed/youtube';

export interface YouTubeMetadata {
  title: string;
  channelName: string;
  channelUrl?: string;
}

const LOOKUP_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CACHE_ENTRIES = 128;
const metadataCache = new Map<string, Promise<YouTubeMetadata | null>>();
const EMBED_FIGURE_RE =
  /<figure[^>]*class=(['"])[^'"]*\bkg-embed-card\b[^'"]*\1[^>]*>\s*<iframe\b[^>]*>\s*<\/iframe>\s*<\/figure>/giu;
const BARE_IFRAME_RE = /<iframe\b[^>]*>\s*<\/iframe>/giu;
const HTML_ATTRIBUTE_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#38;': '&',
  '&#x26;': '&',
  '&quot;': '"',
  '&#34;': '"',
  '&#x22;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&#x27;': "'",
};

function decodeHtmlAttribute(value: string): string {
  return value.replace(
    /&(amp|#38|#x26|quot|#34|#x22|apos|#39|#x27);/giu,
    (entity) => HTML_ATTRIBUTE_ENTITIES[entity.toLowerCase()] ?? entity,
  );
}

function readIframeAttribute(iframeHtml: string, attribute: string): string {
  const match = new RegExp(`\\b${attribute}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'iu')
    .exec(iframeHtml);
  return match ? decodeHtmlAttribute(match[2]).trim() : '';
}

async function replaceYouTubeIframes(html: string, pattern: RegExp): Promise<string> {
  const matches = [...html.matchAll(pattern)];
  if (matches.length === 0) return html;

  const replacements = await Promise.all(matches.map(async (match) => {
    const source = readIframeAttribute(match[0], 'src');
    const reference = parseYouTubeVideoUrl(source);
    if (!reference) return match[0];

    const metadata = await resolveYouTubeMetadata(reference.id);
    return renderYouTubeEmbedMarkup({
      ...reference,
      title: (metadata?.title ?? readIframeAttribute(match[0], 'title')) || 'YouTube video',
      channelName: metadata?.channelName ?? 'YouTube',
      channelUrl: metadata?.channelUrl,
    });
  }));

  let output = '';
  let cursor = 0;
  matches.forEach((match, index) => {
    const start = match.index ?? cursor;
    output += html.slice(cursor, start) + replacements[index];
    cursor = start + match[0].length;
  });
  return output + html.slice(cursor);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new Error('YouTube oEmbed response exceeded the limit');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('YouTube oEmbed response has no body');

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('YouTube oEmbed response exceeded the limit');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function parseMetadata(value: unknown): YouTubeMetadata | null {
  if (!isRecord(value)) return null;

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const channelName = typeof value.author_name === 'string' ? value.author_name.trim() : '';
  if (!title || title.length > 300 || !channelName || channelName.length > 160) return null;

  const channelUrl = safeHttpUrl(value.author_url);
  return {
    title,
    channelName,
    ...(channelUrl ? { channelUrl } : {}),
  };
}

function e2eMetadata(id: string): YouTubeMetadata | null {
  if (process.env.E2E_SITE_FIXTURE !== '1' || id !== 'aqz-KE-bpKQ') return null;

  return {
    title: 'Big Buck Bunny',
    channelName: 'Blender Foundation',
    channelUrl: 'https://www.youtube.com/@BlenderOfficial',
  };
}

async function fetchYouTubeMetadata(id: string): Promise<YouTubeMetadata | null> {
  const fixture = e2eMetadata(id);
  if (fixture) return fixture;

  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', youtubeWatchUrl(id));
  endpoint.searchParams.set('format', 'json');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseMetadata(await readBoundedJson(response));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function resolveYouTubeMetadata(id: string): Promise<YouTubeMetadata | null> {
  const cached = metadataCache.get(id);
  if (cached) return cached;

  const pending = fetchYouTubeMetadata(id);
  metadataCache.set(id, pending);
  if (metadataCache.size > MAX_CACHE_ENTRIES) {
    const oldestId = metadataCache.keys().next().value;
    if (oldestId) metadataCache.delete(oldestId);
  }
  void pending.then((metadata) => {
    if (!metadata && metadataCache.get(id) === pending) {
      metadataCache.delete(id);
    }
  });
  return pending;
}

export async function enrichYouTubeEmbeds(html: string): Promise<string> {
  if (!html || !/youtu(?:\.be|be\.com)|youtube-nocookie\.com/iu.test(html)) return html;

  const withoutEmbedFigures = await replaceYouTubeIframes(html, EMBED_FIGURE_RE);
  return replaceYouTubeIframes(withoutEmbedFigures, BARE_IFRAME_RE);
}

export function resetYouTubeMetadataCacheForTests(): void {
  metadataCache.clear();
}
