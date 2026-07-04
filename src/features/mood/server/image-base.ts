const LEGACY_IMAGE_ORIGIN = 'https://image.buxx.me';
const PUBLIC_IMAGE_API_BASE = 'https://buxx.me/api/v2/images';

export function normalizeMoodImageBase(value: string): string {
  const base = value.trim().replace(/\/+$/, '');
  if (!base) return '';

  try {
    const url = new URL(base);
    if (url.origin === LEGACY_IMAGE_ORIGIN && (url.pathname === '' || url.pathname === '/')) {
      return PUBLIC_IMAGE_API_BASE;
    }
  } catch {
    return base;
  }

  return base;
}

export function normalizeMoodImageUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (url.origin === LEGACY_IMAGE_ORIGIN) {
      return `${PUBLIC_IMAGE_API_BASE}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
    }
  } catch {
    return raw;
  }

  return raw;
}
