import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ACCOUNT = '545faed61bc6b0c8ef2c417303555d6f';
const PREFIX = 'bash scripts/desk-unlock.sh && ';

export async function configureDeskHosted({ api, apply = false, setGitHubSecret, deskKey = '' }) {
  const workers = await api('/workers/scripts');
  const site = workers.find((worker) => worker.id === 'site');
  if (!site?.tag) throw new Error('The site Worker was not found in the configured Cloudflare account.');
  const triggers = await api(`/builds/workers/${site.tag}/triggers`);
  const production = triggers.filter((trigger) => trigger.branch_includes?.length === 1 && trigger.branch_includes[0] === 'main');
  if (production.length !== 1) throw new Error('Expected exactly one production trigger matching only main; inspect Builds branch configuration.');
  const previews = triggers.filter((trigger) => trigger !== production[0]);
  if (previews.some((trigger) => !trigger.branch_excludes?.includes('main'))) {
    throw new Error('Preview triggers must explicitly exclude main; no settings were changed.');
  }
  const plan = triggers.map((trigger) => ({
    id: trigger.trigger_uuid,
    production: trigger === production[0],
    build_command: (trigger.build_command ?? '').startsWith(PREFIX)
      ? trigger.build_command : PREFIX + (trigger.build_command?.trim() || ':'),
  }));
  for (const trigger of plan) {
    console.log(`${trigger.production ? 'Production' : 'Preview'}: ${trigger.id}; build command: ${trigger.build_command}`);
  }
  console.log('Production gets DESK_KEY (secret) and DESK_REQUIRED=1; previews omit both.');
  if (!apply) {
    console.log('Check only. Run again with --apply when ready.');
    return;
  }
  if (!deskKey || deskKey.length < 44) throw new Error('Initialize the dedicated desk key locally before --apply.');
  // Configure the secret before enabling the required production build.
  await setGitHubSecret();
  for (const trigger of plan) {
    const path = `/builds/triggers/${trigger.id}`;
    if (trigger.production) {
      await api(`${path}/environment_variables`, 'PATCH', {
        DESK_KEY: { value: deskKey, is_secret: true },
        DESK_REQUIRED: { value: '1', is_secret: false },
      });
    } else {
      const variables = await api(`${path}/environment_variables`);
      for (const name of ['DESK_KEY', 'DESK_REQUIRED']) {
        if (Object.hasOwn(variables, name)) await api(`${path}/environment_variables/${name}`, 'DELETE');
      }
    }
    await api(path, 'PATCH', { build_command: trigger.build_command });
    const variables = await api(`${path}/environment_variables`);
    if (trigger.production) {
      if (!variables.DESK_KEY?.is_secret || variables.DESK_REQUIRED?.value !== '1') {
        throw new Error('Production variable readback failed. Re-run --check and inspect Builds settings.');
      }
    } else if (Object.hasOwn(variables, 'DESK_KEY') || Object.hasOwn(variables, 'DESK_REQUIRED')) {
      throw new Error('Preview variable readback failed. Inspect Builds settings.');
    }
  }
  const updated = await api(`/builds/workers/${site.tag}/triggers`);
  if (plan.some((trigger) => updated.find((candidate) => candidate.trigger_uuid === trigger.id)?.build_command !== trigger.build_command)) {
    throw new Error('Cloudflare Builds command readback failed. Re-run --check and inspect settings.');
  }
  console.log('GitHub Actions and Cloudflare Builds configured. No build or deployment was triggered.');
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !['--check', '--apply'].includes(flag)) || flags.includes('--check') && flags.includes('--apply')) {
    throw new Error('Usage: node scripts/desk-hosted-setup.mjs [--check|--apply]');
  }
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN or use node --env-file=.env.local. The token needs Workers Builds Configuration Edit and Workers Scripts Read.');
  const apply = flags.includes('--apply');
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    // API responses can include variable values; report only fixed diagnostics.
    if (!response.ok || !result.success) throw new Error(`Cloudflare Builds request failed (HTTP ${response.status}); verify the token's user scope and permissions.`);
    return result.result;
  };
  if (apply) {
    if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0) throw new Error('Run gh auth login before --apply.');
    const key = execFileSync('git', ['config', '--local', '--get', 'transcrypt.password'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().replace(/\r?\n$/, '');
    if (key.length < 44) throw new Error('Initialize the dedicated desk key locally before --apply.');
    return configureDeskHosted({ api, apply, deskKey: key, setGitHubSecret: async () => {
      const result = spawnSync('gh', ['secret', 'set', 'DESK_KEY', '--repo', 'bunizao/site'], { input: key, stdio: ['pipe', 'ignore', 'ignore'] });
      if (result.status !== 0) throw new Error('GitHub secret update failed; verify access to bunizao/site.');
      console.log('GitHub Actions: DESK_KEY saved.');
    } });
  }
  await configureDeskHosted({ api });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); }
  catch (error) {
    // Suppress raw subprocess/network errors, which can contain credentials.
    const message = error instanceof Error && /^(The site |Expected |Preview |Production |Cloudflare Builds |Set CLOUDFLARE|Run gh |Initialize |GitHub |Usage:)/.test(error.message)
      ? error.message : 'Hosted setup failed; credentials were not printed. Check authentication and try again.';
    console.error(message);
    process.exit(1);
  }
}
