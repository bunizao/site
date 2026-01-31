const STATIC_PROXY_PREFIX = '/static/';
const DEFAULT_IMAGE_WIDTHS = [64, 96, 128, 192, 256, 320, 480, 640, 960, 1280, 1600, 2048];

const isRemoteUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isDataUrl = (value: string): boolean => /^(data:|blob:)/i.test(value);

const normalizeRemoteUrl = (value: string): string => {
  if (value.startsWith('//')) return `https:${value}`;
  return value;
};

export function setImageWidth(src: string, width: number): string {
  if (!src || !Number.isFinite(width) || width <= 0) return src;
  if (isDataUrl(src)) return src;

  const isProxied = src.startsWith(STATIC_PROXY_PREFIX);
  const rawTarget = isProxied ? src.slice(STATIC_PROXY_PREFIX.length) : src;
  const normalizedTarget = normalizeRemoteUrl(rawTarget);
  if (!isRemoteUrl(normalizedTarget)) return src;

  try {
    const url = new URL(normalizedTarget);
    url.searchParams.delete('w');
    url.searchParams.set('w', String(Math.round(width)));
    const next = url.toString();
    return isProxied ? `${STATIC_PROXY_PREFIX}${next}` : next;
  } catch {
    const cleaned = normalizedTarget.replace(/[?&]w=\d+/g, '');
    const separator = cleaned.includes('?') ? '&' : '?';
    const next = `${cleaned}${separator}w=${Math.round(width)}`;
    return isProxied ? `${STATIC_PROXY_PREFIX}${next}` : next;
  }
}

export function buildImageSrcset(src: string, widths: number[] = DEFAULT_IMAGE_WIDTHS): string {
  if (!src) return '';
  if (isDataUrl(src)) return '';

  const uniqueWidths = Array.from(new Set(widths))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const seen = new Set<string>();
  const candidates: string[] = [];

  uniqueWidths.forEach((width) => {
    const next = setImageWidth(src, width);
    if (!next || seen.has(next)) return;
    seen.add(next);
    candidates.push(`${next} ${width}w`);
  });

  return candidates.join(', ');
}
