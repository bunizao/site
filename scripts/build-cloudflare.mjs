import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveCloudflareBuildId } from './build-id.mjs';
import { carryOverAstroAssets } from './carry-over-astro-assets.mjs';
import { verifyCloudflareDeployArtifacts } from './cloudflare-deploy-guard.mjs';

// buxx.me and www.buxx.me are routed to this Worker. Ghost build requests must
// use the separate Ghost origin instead of looping through the site Worker.
const SELF_ROUTED_HOSTS = new Set(['buxx.me', 'www.buxx.me']);

function hasValue(value) {
  return Boolean(value?.trim());
}

function isEnabledFlag(value) {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function ghostUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

// Returns why a production build must not start, or null when it may.
export function readBuildEnvError(env) {
  const missing = [];
  if (!hasValue(env.PUBLIC_GHOST_URL)) {
    missing.push('PUBLIC_GHOST_URL');
  }
  if (!hasValue(env.GHOST_CONTENT_API_KEY)) {
    missing.push('GHOST_CONTENT_API_KEY');
  }
  if (missing.length > 0) {
    return [
      'Missing Cloudflare build-time Ghost environment variables:',
      ...missing.map((name) => `- ${name}`),
      '',
      'Static blog and Writing pages are prerendered during `bun run build`.',
      'Cloudflare Worker runtime vars/secrets do not change already-built HTML.',
    ].join('\n');
  }

  if (isEnabledFlag(env.GHOST_MOCK_CONTENT) || isEnabledFlag(env.E2E_SITE_FIXTURE)) {
    return 'Mock Ghost content is disabled for Cloudflare builds.';
  }

  const ghostHost = ghostUrlHost(env.PUBLIC_GHOST_URL);
  if (ghostHost && SELF_ROUTED_HOSTS.has(ghostHost)) {
    return [
      `PUBLIC_GHOST_URL points at ${ghostHost}, which is routed to this worker.`,
      'Production prerendering would fetch Ghost content from the worker itself and fail.',
      'Set PUBLIC_GHOST_URL in the Workers Builds environment to the real Ghost origin.',
    ].join('\n');
  }

  return null;
}

function runCloudflareBuild() {
  const error = readBuildEnvError(process.env);
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const buildEnv = {
    ...process.env,
    PUBLIC_BUILD_ID: resolveCloudflareBuildId(process.env),
    GHOST_MOCK_CONTENT: '0',
    E2E_SITE_FIXTURE: '0',
  };
  const child = spawn('bun', ['run', 'build'], {
    env: buildEnv,
    stdio: 'inherit',
  });

  child.on('exit', async (code, signal) => {
    if (signal) {
      console.error(`Cloudflare build stopped by ${signal}.`);
      process.exit(1);
    }
    if (code !== 0) {
      process.exit(code ?? 1);
    }
    if (!verifyCloudflareDeployArtifacts()) process.exit(1);
    await carryOverAstroAssets({ origin: buildEnv.PUBLIC_SITE_URL?.trim() || 'https://buxx.me' });
    process.exit(0);
  });
}

const isDirectRun = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) runCloudflareBuild();
