const DEFAULT_BASE_URL = 'https://local.invalid';

export function withWidthParam(value: string, width: number, baseUrl = DEFAULT_BASE_URL): string {
  if (!value || /^(data:|blob:)/i.test(value)) return value;
  const isAbsolute = /^(https?:)?\/\//i.test(value);
  const parsed = new URL(value, baseUrl);
  parsed.searchParams.set('w', String(width));
  if (isAbsolute) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildSrcSet(
  value: string,
  widths: readonly number[],
  baseUrl = DEFAULT_BASE_URL
): string {
  if (!value || /^(data:|blob:)/i.test(value)) return '';
  return widths.map((width) => `${withWidthParam(value, width, baseUrl)} ${width}w`).join(', ');
}

export function applyResponsiveImage(
  img: HTMLImageElement,
  src: string,
  sizes: string,
  widths: readonly number[],
  baseUrl = window.location.origin
): void {
  const srcSet = buildSrcSet(src, widths, baseUrl);
  if (!srcSet) return;
  img.srcset = srcSet;
  img.sizes = sizes;
}
