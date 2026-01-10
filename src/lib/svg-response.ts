const svgSecurityHeaders = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;",
};

export function svgResponse(svg: string, cacheControl: string): Response {
  return new Response(svg, {
    headers: {
      ...svgSecurityHeaders,
      'Cache-Control': cacheControl,
    },
  });
}
