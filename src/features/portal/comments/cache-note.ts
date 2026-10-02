/** What every change to who may comment says. Cookie-less comment reads are
    edge-cached (30s, then 60s stale-while-revalidate), so such readers see a
    change within about 90 seconds; readers with a cookie see it at once.
    A leaf module, so the site-wide switches (Home, the palette) can say it
    without loading the per-post modes. */
export const CACHE_NOTE = 'Changes reach cookie-less readers within about 90s.';
