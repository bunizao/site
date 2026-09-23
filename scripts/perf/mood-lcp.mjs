// Usage: node scripts/perf/mood-lcp.mjs [url] [runs]
// Cold-cache LCP/FCP/TTFB baseline for /mood. One fresh context per run.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'https://buxx.me/mood';
const runs = Number(process.argv[3] ?? 8);
const browser = await chromium.launch();
const rows = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__lcp = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp.push({ t: e.startTime, url: e.url ?? '', el: e.element?.tagName ?? '' });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    const lcp = window.__lcp.at(-1) ?? null;
    const img = lcp?.url ? performance.getEntriesByName(lcp.url)[0] : null;
    return {
      ttfb: nav.responseStart,
      fcp,
      lcp: lcp?.t ?? null,
      lcpEl: lcp?.el,
      lcpUrl: lcp?.url?.replace(/^https:\/\/buxx\.me/, '') ?? '',
      imgStart: img?.requestStart ?? null,
      imgTtfb: img ? img.responseStart - img.requestStart : null,
      imgEnd: img?.responseEnd ?? null,
    };
  });
  rows.push(m);
  console.log(JSON.stringify(m));
  await ctx.close();
}
await browser.close();
const med = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log('median', { ttfb: med('ttfb'), fcp: med('fcp'), lcp: med('lcp'), imgTtfb: med('imgTtfb'), imgEnd: med('imgEnd') });
