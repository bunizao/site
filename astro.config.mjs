import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

const isCoverageEnabled = process.env.COVERAGE === '1';
const isE2EStrictPort = process.env.ASTRO_E2E_STRICT_PORT === '1';
// The Cloudflare adapter renders dev SSR inside a workerd module-runner, which
// is ESM-only and crashes on CJS deps ("module is not defined"). It is also
// unnecessary now that the API is a separate deployed worker: `astro dev` only
// needs a JS runtime with fetch. Apply the adapter for build/preview only; dev
// runs on Astro's native Node SSR and proxies /api/* to the cloud site-api.
const isDevServer = process.argv.includes('dev');
const coveragePlugins = [];
const publicSitemapPaths = new Set(['/', '/mood/', '/privacy/']);
const devOptimizerExcludes = [
  'cheerio',
  'cheerio-select',
  'css-select',
  'domutils',
  'entities',
];
const devOptimizerIncludes = [
  'react',
  'react-dom',
  'react/jsx-dev-runtime',
  'react/jsx-runtime',
];

if (isCoverageEnabled) {
  const { default: istanbul } = await import('vite-plugin-istanbul');
  coveragePlugins.push(
    istanbul({
      include: [
        'src/components/**/*',
        'src/layouts/**/*',
        'src/pages/**/*.astro',
        'src/lib/comment-content.ts',
        'src/lib/utils.ts',
      ],
      exclude: [
        'tests/**',
        'workers/**',
      ],
      extension: ['.js', '.ts', '.tsx', '.astro'],
      requireEnv: false,
      cypress: false,
    }),
  );
}

export default defineConfig({
  integrations: [
    react(),
    starlight({
      title: 'buxx docs',
      favicon: '/logo/peek.svg',
      disable404Route: true,
      prerender: false,
      pagefind: false,
      // Docs are nested under src/content/docs/docs/, so every slug starts with
      // `docs/` and the site serves them at /docs/* alongside the main app.
      customCss: ['./src/styles/docs.css'],
      // Component overrides: brand the header with the buxx peek logo, render
      // an internal-page banner inside the doc body, and drop Starlight's
      // Previous/Next rail since these pages do not read sequentially.
      components: {
        SiteTitle: './src/components/docs/SiteTitle.astro',
        PageTitle: './src/components/docs/PageTitle.astro',
        Pagination: './src/components/docs/Pagination.astro',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/bunizao' },
      ],
      // Public docs opt out of auth with frontmatter `public: true`; protected
      // docs stay behind the admin session and get a body-level badge.
      // See docs/PUBLIC-PLAN.md.
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'About this site', slug: 'docs/overview/about' },
            { label: 'Architecture', slug: 'docs/overview/architecture' },
          ],
        },
        {
          label: 'Surfaces',
          items: [
            { label: 'Home', slug: 'docs/surfaces/home' },
            { label: 'Mood feed', slug: 'docs/surfaces/mood-feed' },
            { label: 'Mood decoupling', slug: 'docs/surfaces/mood-decoupling' },
            { label: 'Mascot', slug: 'docs/surfaces/mascot' },
            { label: 'Spotlight overlay', slug: 'docs/surfaces/spotlight-overlay' },
            { label: 'Shared layout', slug: 'docs/surfaces/shared-layout' },
          ],
        },
        {
          label: 'Content pipeline',
          items: [
            { label: 'Telegram ingestion', slug: 'docs/pipeline/telegram' },
            { label: 'Live photo issue', slug: 'docs/pipeline/live-photo-issue' },
            { label: 'Image quality', slug: 'docs/pipeline/image-quality' },
            { label: 'Email notify', slug: 'docs/pipeline/email-notify' },
          ],
        },
        {
          label: 'APIs',
          items: [
            { label: 'oEmbed', slug: 'docs/apis/oembed' },
            { label: 'SVG', slug: 'docs/apis/svg' },
          ],
        },
        {
          label: 'Infrastructure',
          items: [
            { label: 'Worker site', slug: 'docs/infra/worker-site' },
            { label: 'OAuth Hub', slug: 'docs/infra/oauth-hub' },
          ],
        },
        {
          label: 'Quality',
          items: [
            { label: 'E2E behavior scope', slug: 'docs/quality/e2e-scope' },
            { label: 'Debug logs', slug: 'docs/quality/debug-logs' },
          ],
        },
        {
          label: 'Resources',
          items: [
            { label: 'Privacy policy', slug: 'docs/resources/privacy' },
            { label: 'Security', slug: 'docs/resources/security' },
          ],
        },
      ],
    }),
    sitemap({
      filter: (page) => publicSitemapPaths.has(new URL(page).pathname),
    }),
  ],
  devToolbar: {
    enabled: false,
  },
  site: 'https://buxx.me',
  output: 'static',
  compressHTML: true,
  // Prefetch internal links on hover/focus. Portal (`/dev/*`) pages set
  // `data-astro-prefetch="false"` on their own links so authenticated routes
  // are never speculatively fetched.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  security: {
    checkOrigin: false,
  },
  ...(isDevServer
    ? {}
    : {
        adapter: cloudflare({
          imageService: 'passthrough',
          prerenderEnvironment: 'node',
        }),
      }),
  server: {
    strictPort: isE2EStrictPort,
  },
  vite: {
    plugins: coveragePlugins,
    optimizeDeps: {
      include: devOptimizerIncludes,
      exclude: devOptimizerExcludes,
    },
    build: {
      sourcemap: isCoverageEnabled,
      minify: 'esbuild',
      cssMinify: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
