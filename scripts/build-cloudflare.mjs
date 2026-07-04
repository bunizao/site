import { spawn } from 'node:child_process';

const PRODUCTION_BRANCHES = new Set(['main', 'production', 'cloudflare-runtime']);

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

function isWorkersPreviewBuild() {
  const branch = process.env.WORKERS_CI_BRANCH?.trim();
  return process.env.WORKERS_CI === '1'
    && Boolean(branch)
    && !PRODUCTION_BRANCHES.has(branch);
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

const buildEnv = { ...process.env };
const missing = getMissingGhostEnv();

if (missing.length > 0) {
  if (!isWorkersPreviewBuild()) {
    printMissingEnvError(missing);
    process.exit(1);
  }

  console.warn(
    [
      'Missing Ghost build env in Workers preview branch.',
      'Using mock blog content for this non-production build.',
    ].join('\n'),
  );
  buildEnv.GHOST_MOCK_CONTENT = '1';
  buildEnv.PUBLIC_GHOST_URL ||= 'https://blog.buxx.me';
}

// blog.buxx.me is routed to this worker (see wrangler.jsonc routes). A
// production build that fetches Ghost content through it would hit the worker
// itself and 404 on /ghost/api/*. The build env must point at the real Ghost
// origin.
const SELF_ROUTED_HOSTS = new Set(['blog.buxx.me', 'buxx.me', 'www.buxx.me']);

function ghostUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

const ghostHost = ghostUrlHost(buildEnv.PUBLIC_GHOST_URL ?? '');
const usesMockContent = buildEnv.GHOST_MOCK_CONTENT === '1';

if (
  !isWorkersPreviewBuild()
  && !usesMockContent
  && ghostHost
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
  process.exit(code ?? 1);
});
