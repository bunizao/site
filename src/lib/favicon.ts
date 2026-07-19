// Favicon hrefs switch on the runtime: `astro dev` serves badged variants
// (mark on an amber tile) so local tabs are distinguishable from prod at a
// glance. `import.meta.env.DEV` is false for builds, so preview and prod
// deployments always get the canonical marks.
export const SITE_FAVICON = import.meta.env.DEV
  ? '/logo/peek-dev.svg'
  : '/logo/peek.svg?v=3';

export const BLOG_FAVICON = import.meta.env.DEV
  ? '/blog-mark-dev.svg'
  : '/blog-mark.svg?v=2';
