import { youtubeWatchUrl } from '@/lib/embed/youtube';

export interface YouTubeMetadata {
  title: string;
  channelName: string;
  channelUrl?: string;
}

const LOOKUP_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_CACHE_ENTRIES = 128;
const metadataCache = new Map<string, Promise<YouTubeMetadata | null>>();

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

export function resetYouTubeMetadataCacheForTests(): void {
  metadataCache.clear();
}
