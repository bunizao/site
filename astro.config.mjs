import { defineConfig } from 'astro/config';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Vite serves only what lives under the project root. A git worktree keeps its
 * node_modules in the main checkout — outside that root — so every dependency
 * 403s in dev and no React island ever hydrates. Walk up and allow the first
 * ancestor that actually owns a node_modules directory.
 */
function dependencyRoots() {
  const roots = [];
  for (let dir = projectRoot; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules'))) roots.push(dir);
    if (dir === dirname(dir)) break;
  }
  return roots;
}

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
const negotiatedContentPageEntrypoints = new Set([
  'src/pages/index.astro',
  'src/pages/privacy.astro',
  'src/pages/blog/index.astro',
  'src/pages/blog/tags.astro',
  'src/pages/blog/tag/[slug].astro',
  'src/pages/blog/[slug].astro',
]);
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
    {
      name: 'buxx-negotiated-content-dev-ssr',
      hooks: {
        'astro:route:setup': ({ route }) => {
          if (!isDevServer || !negotiatedContentPageEntrypoints.has(route.component)) {
            return;
          }

          route.prerender = false;
        },
      },
    },
    react(),
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
    server: {
      fs: { allow: [projectRoot, ...dependencyRoots()] },
    },
    optimizeDeps: {
      include: devOptimizerIncludes,
      exclude: devOptimizerExcludes,
    },
    build: {
      sourcemap: isCoverageEnabled,
      minify: 'esbuild',
      // Vite defaults cssMinify to lightningcss, which collapses the
      // `-webkit-backdrop-filter` + `backdrop-filter` pair into a single
      // declaration and strips the glass effect in Chrome. esbuild keeps
      // both vendor variants intact.
      cssMinify: 'esbuild',
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
