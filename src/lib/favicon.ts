// Tab icons, one URL per browser colour scheme. Browsers rasterise a favicon
// once per URL, so an icon that adapts by its own media query never follows a
// live scheme change; Favicon.astro swaps between these URLs instead.
//
// `astro dev` serves badged variants (mark on an amber tile) so local tabs are
// distinguishable from prod at a glance. `import.meta.env.DEV` is false for
// builds, so preview and prod deployments always get the canonical marks.
export interface FaviconPair {
  light: string;
  dark: string;
  type: string;
}

const DEV = import.meta.env.DEV;

export const SITE_FAVICON: FaviconPair = DEV
  ? { light: '/logo/peek-dev.svg', dark: '/logo/peek-dev.svg', type: 'image/svg+xml' }
  : { light: '/favicon-light.png', dark: '/favicon-dark.png', type: 'image/png' };

export const BLOG_FAVICON: FaviconPair = DEV
  ? { light: '/blog-mark-dev.svg', dark: '/blog-mark-dev.svg', type: 'image/svg+xml' }
  : { light: '/blog-mark.svg?v=2', dark: '/blog-mark-dark.svg', type: 'image/svg+xml' };
