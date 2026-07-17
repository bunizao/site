import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG_PATH = 'dist/server/wrangler.json';
const BLOG_ARTIFACT_PATH = 'dist/client/blog/index.html';
const DEPLOY_GUARD_COMMAND = 'node scripts/cloudflare-deploy-guard.mjs check';
const MOCK_POST_SLUGS = [
  'demo-effects',
  'quiet-architecture',
  'notes-from-the-links-lab',
  'shell-work-before-polish',
  'the-kg-contract-stays',
  'search-needs-a-real-decision',
  'members-without-portal-theater',
  'archive-pages-deserve-respect',
  'verification-beats-vibes',
];

function readText(path) {
  return readFileSync(resolve(path), 'utf8');
}

function readConfig() {
  return JSON.parse(readText(CONFIG_PATH));
}

function findMockSlugs(html) {
  return MOCK_POST_SLUGS.filter((slug) => html.includes(`/blog/${slug}/`));
}

export function installCloudflareDeployGuard() {
  const config = readConfig();
  config.build = {
    ...config.build,
    command: DEPLOY_GUARD_COMMAND,
  };
  writeFileSync(resolve(CONFIG_PATH), `${JSON.stringify(config)}\n`);
  console.log('Installed the Cloudflare production content deploy guard.');
}

export function verifyCloudflareDeployArtifacts() {
  let config;
  let html;

  try {
    config = readConfig();
    html = readText(BLOG_ARTIFACT_PATH);
  } catch (error) {
    console.error(`Cloudflare deploy guard could not read build artifacts: ${error.message}`);
    return false;
  }

  if (config.build?.command !== DEPLOY_GUARD_COMMAND) {
    console.error('Cloudflare deploy config is missing the production content guard.');
    return false;
  }

  const mockSlugs = findMockSlugs(html);
  if (mockSlugs.length > 0) {
    console.error(`Cloudflare deploy blocked mock Ghost posts: ${mockSlugs.join(', ')}.`);
    return false;
  }

  const blogPostLinks = html.match(/href=["']\/blog\/(?!tag\/|tags\/)[^\/"']+\/["']/g) ?? [];
  if (blogPostLinks.length === 0) {
    console.error('Cloudflare deploy blocked an empty blog artifact.');
    return false;
  }

  console.log(`Cloudflare deploy guard passed with ${blogPostLinks.length} blog post links.`);
  return true;
}

const isDirectRun = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const mode = process.argv[2] ?? 'check';

  if (mode === 'install') {
    installCloudflareDeployGuard();
  } else if (mode === 'check') {
    process.exitCode = verifyCloudflareDeployArtifacts() ? 0 : 1;
  } else {
    console.error(`Unknown Cloudflare deploy guard mode: ${mode}`);
    process.exitCode = 1;
  }
}
