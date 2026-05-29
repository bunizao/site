import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import starlight from '@astrojs/starlight';

const isCoverageEnabled = process.env.COVERAGE === '1';
const isE2EStrictPort = process.env.ASTRO_E2E_STRICT_PORT === '1';
const coveragePlugins = [];

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
      // Docs are nested under src/content/docs/docs/, so every slug starts with
      // `docs/` and the site serves them at /docs/* alongside the main app.
      customCss: ['./src/styles/docs.css'],
      pagefind: true,
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/bunizao' },
      ],
      // A lock badge marks pages gated behind the admin OAuth session. Visibility
      // is static (frontmatter `internal: true`); the actual gate lives in
      // middleware. See docs/PUBLIC-PLAN.md.
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
            { label: 'Home', slug: 'docs/surfaces/home', badge: { text: 'internal', variant: 'caution' } },
            { label: 'Mood feed', slug: 'docs/surfaces/mood-feed' },
            { label: 'Mood decoupling', slug: 'docs/surfaces/mood-decoupling', badge: { text: 'internal', variant: 'caution' } },
            { label: 'Mascot', slug: 'docs/surfaces/mascot' },
            { label: 'Spotlight overlay', slug: 'docs/surfaces/spotlight-overlay', badge: { text: 'internal', variant: 'caution' } },
            { label: 'Shared layout', slug: 'docs/surfaces/shared-layout', badge: { text: 'internal', variant: 'caution' } },
          ],
        },
        {
          label: 'Content pipeline',
          items: [
            { label: 'Telegram ingestion', slug: 'docs/pipeline/telegram' },
            { label: 'Live photo issue', slug: 'docs/pipeline/live-photo-issue', badge: { text: 'internal', variant: 'caution' } },
            { label: 'Image quality', slug: 'docs/pipeline/image-quality', badge: { text: 'internal', variant: 'caution' } },
            { label: 'Email notify', slug: 'docs/pipeline/email-notify', badge: { text: 'internal', variant: 'caution' } },
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
            { label: 'E2E behavior scope', slug: 'docs/quality/e2e-scope', badge: { text: 'internal', variant: 'caution' } },
            { label: 'Debug logs', slug: 'docs/quality/debug-logs', badge: { text: 'internal', variant: 'caution' } },
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
  ],
  devToolbar: {
    enabled: false,
  },
  site: 'https://buxx.me',
  output: 'static',
  compressHTML: true,
  security: {
    checkOrigin: false,
  },
  adapter: vercel(),
  server: {
    strictPort: isE2EStrictPort,
  },
  vite: {
    plugins: coveragePlugins,
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
