import { rewriteGhostBlogImageUrl } from '@/features/posts/adapter/provider';

const LEGACY_GHOST_SINGLE_SEGMENT_SLUGS = new Set([
  '2026',
  'sacrifice',
  'existence',
  'time-warp',
  '2025',
  '2024',
  'remedy',
  'zootopia',
  'dreamcatcher',
  'dear-dont-be-confused',
  'ni-shan-road',
  'haven',
  'poem-for-the-sea',
  'spring-24',
  'about',
]);

export function redirectLegacyGhostHost(url: URL): Response | null {
  if (url.hostname !== 'blog.buxx.me') return null;

  if (url.pathname === '/' || url.pathname === '') {
    return Response.redirect('https://buxx.me/blog', 301);
  }
  if (url.pathname === '/links' || url.pathname === '/links/') {
    return Response.redirect('https://buxx.me/blog', 301);
  }
  if (url.pathname === '/tags' || url.pathname === '/tags/') {
    return Response.redirect('https://buxx.me/blog/tags', 301);
  }

  if (
    url.pathname === '/rss' ||
    url.pathname === '/rss/' ||
    url.pathname === '/feed' ||
    url.pathname === '/feed/'
  ) {
    return Response.redirect('https://buxx.me/blog/rss.xml', 301);
  }

  if (url.pathname === '/sitemap.xml' || /^\/sitemap-[a-z]+\.xml$/u.test(url.pathname)) {
    return Response.redirect('https://buxx.me/sitemap.xml', 301);
  }

  if (url.pathname.startsWith('/content/images/')) {
    const proxied = rewriteGhostBlogImageUrl(
      `${url.pathname}${url.search}`,
      'https://blog.buxx.me',
    );
    if (proxied && proxied.startsWith('/api/')) {
      return Response.redirect(`https://buxx.me${proxied}`, 301);
    }
    return null;
  }

  const tagMatch = url.pathname.match(/^\/tag\/([^/]+)\/?$/);
  if (tagMatch?.[1]) {
    return Response.redirect(`https://buxx.me/blog/tag/${tagMatch[1]}`, 301);
  }

  if (/^\/author\/[^/]+\/?$/u.test(url.pathname)) {
    return Response.redirect('https://buxx.me/blog', 301);
  }

  const finalSegment = url.pathname.replace(/\/+$/u, '').split('/').at(-1) ?? '';
  if (finalSegment.includes('.')) return null;

  const slugMatch = url.pathname.match(/^\/([^/]+)\/?$/);
  if (slugMatch?.[1] && LEGACY_GHOST_SINGLE_SEGMENT_SLUGS.has(slugMatch[1])) {
    return Response.redirect(`https://buxx.me/blog/${slugMatch[1]}`, 301);
  }

  return null;
}
