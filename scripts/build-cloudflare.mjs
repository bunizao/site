import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MOCK_POST_SLUGS = [
  'demo-effects',
  'notes-from-the-links-lab',
  'quiet-architecture',
  'the-kg-contract-stays',
];

function hasValue(name) {
  return Boolean(process.env[name]?.trim());
}

function getMissingGhostEnv() {
  const missing = [];
  if (!hasValue('PUBLIC_GHOST_URL')) {
    missing.push('PUBLIC_GHOST_URL');
  }
  if (!hasValue('GHOST_CONTENT_API_KEY') && !hasValue('GHOST_CONTENT_APIKEY')) {
    missing.push('GHOST_CONTENT_API_KEY');
  }
  return missing;
}

function isEnabledFlag(name) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

function printMissingEnvError(missing) {
  console.error(
    [
      'Missing Cloudflare build-time Ghost environment variables:',
      ...missing.map((name) => `- ${name}`),
      '',
      'Static blog and Writing pages are prerendered during `bun run build`.',
      'Cloudflare Worker runtime vars/secrets do not change already-built HTML.',
    ].join('\n'),
  );
}

function verifyBlogArtifact() {
  const artifactPath = resolve('dist/client/blog/index.html');
  let html;

  try {
    html = readFileSync(artifactPath, 'utf8');
  } catch {
    console.error(`Cloudflare build did not produce ${artifactPath}.`);
    return false;
  }

  const mockSlugs = MOCK_POST_SLUGS.filter((slug) => html.includes(`/blog/${slug}/`));
  if (mockSlugs.length === 0) return true;

  console.error(
    `Cloudflare build produced mock Ghost posts: ${mockSlugs.join(', ')}.`,
  );
  return false;
}

const buildEnv = { ...process.env };
const missing = getMissingGhostEnv();

if (missing.length > 0) {
  printMissingEnvError(missing);
  process.exit(1);
}

if (isEnabledFlag('GHOST_MOCK_CONTENT') || isEnabledFlag('E2E_SITE_FIXTURE')) {
  console.error('Mock Ghost content is disabled for Cloudflare builds.');
  process.exit(1);
}

buildEnv.GHOST_MOCK_CONTENT = '0';
buildEnv.E2E_SITE_FIXTURE = '0';

// buxx.me and www.buxx.me are routed to this Worker. Ghost build requests must
// use the separate Ghost origin instead of looping through the site Worker.
const SELF_ROUTED_HOSTS = new Set(['buxx.me', 'www.buxx.me']);

function ghostUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

const ghostHost = ghostUrlHost(buildEnv.PUBLIC_GHOST_URL ?? '');

if (
  ghostHost
  && SELF_ROUTED_HOSTS.has(ghostHost)
) {
  console.error(
    [
      `PUBLIC_GHOST_URL points at ${ghostHost}, which is routed to this worker.`,
      'Production prerendering would fetch Ghost content from the worker itself and fail.',
      'Set PUBLIC_GHOST_URL in the Workers Builds environment to the real Ghost origin.',
    ].join('\n'),
  );
  process.exit(1);
}

const child = spawn('bun', ['run', 'build'], {
  env: buildEnv,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Cloudflare build stopped by ${signal}.`);
    process.exit(1);
  }
  if (code !== 0) {
    process.exit(code ?? 1);
  }
  process.exit(verifyBlogArtifact() ? 0 : 1);
});
