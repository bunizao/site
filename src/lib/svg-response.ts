const svgSecurityHeaders = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; font-src 'self';",
};

export function svgResponse(svg: string, cacheControl: string): Response {
  return new Response(svg, {
    headers: {
      ...svgSecurityHeaders,
      'Cache-Control': cacheControl,
    },
  });
}
