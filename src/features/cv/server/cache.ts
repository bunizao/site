const CV_FULL_COOKIE = 'cv_full=';
const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

export function normalizeCvHtmlCacheSearch(url: URL): string | null {
  if (url.searchParams.has('key')) return null;

  return url.searchParams.get('lang') === 'zh' ? '?lang=zh' : '';
}

export function hasCvFullCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie.split(';').some((part) => part.trim().startsWith(CV_FULL_COOKIE));
}

export function isCvFullHtmlRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, '') !== '/cv') return false;
  return hasCvFullCookie(request) || Boolean(request.headers.get(ACCESS_JWT_HEADER));
}
