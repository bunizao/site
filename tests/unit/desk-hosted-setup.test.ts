import { expect, test } from 'bun:test';
import { configureDeskHosted } from '../../scripts/desk-hosted-setup.mjs';

function fixture() {
  const triggers = [
    { trigger_uuid: 'prod', branch_includes: ['main'], branch_excludes: [], build_command: 'bun run build:cloudflare', deploy_command: 'keep deployment' },
    { trigger_uuid: 'preview', branch_includes: ['*'], branch_excludes: ['main'], build_command: 'bun run build:cloudflare', deploy_command: 'keep preview' },
  ];
  const variables: Record<string, Record<string, { value: string; is_secret: boolean }>> = {
    prod: { EXISTING: { value: 'preserve', is_secret: true } },
    preview: { EXISTING: { value: 'preserve', is_secret: true }, DESK_KEY: { value: 'old key', is_secret: true }, DESK_REQUIRED: { value: '1', is_secret: false } },
  };
  const writes: string[] = [];
  const api = async (path: string, method = 'GET', body?: any) => {
    if (method !== 'GET') writes.push(method + ' ' + path);
    if (path === '/workers/scripts') return [{ id: 'site', tag: 'site-tag' }];
    if (path === '/builds/workers/site-tag/triggers') return triggers;
    const [, id, variable] = path.match(/^\/builds\/triggers\/([^/]+)(?:\/environment_variables(?:\/([^/]+))?)?$/) ?? [];
    if (!id) throw new Error('Unknown fixture path');
    if (path.includes('environment_variables')) {
      if (method === 'DELETE') delete variables[id][variable];
      if (method === 'PATCH') Object.assign(variables[id], body);
      return variables[id];
    }
    Object.assign(triggers.find((trigger) => trigger.trigger_uuid === id)!, body);
    return triggers.find((trigger) => trigger.trigger_uuid === id);
  };
  return { api, writes, triggers, variables };
}

test('check mode reads trigger configuration without writing secrets', async () => {
  const state = fixture();
  await configureDeskHosted({ api: state.api, setGitHubSecret: () => { throw new Error('Must not write'); } });
  expect(state.writes).toEqual([]);
});

test('apply preserves unrelated settings, keeps previews locked and is idempotent', async () => {
  const state = fixture();
  const deskKey = 'fixture-only-key'.repeat(4);
  let githubUpdates = 0;
  const options = { api: state.api, apply: true, deskKey, setGitHubSecret: async () => { githubUpdates++; } };
  await configureDeskHosted(options);
  await configureDeskHosted(options);
  expect(githubUpdates).toBe(2);
  expect(state.variables.prod.DESK_KEY).toEqual({ value: deskKey, is_secret: true });
  expect(state.variables.prod.DESK_REQUIRED.value).toBe('1');
  expect(state.variables.prod.EXISTING.value).toBe('preserve');
  expect(state.variables.preview.EXISTING.value).toBe('preserve');
  expect(state.variables.preview.DESK_KEY).toBeUndefined();
  expect(state.variables.preview.DESK_REQUIRED).toBeUndefined();
  expect(state.triggers.map((trigger) => trigger.deploy_command)).toEqual(['keep deployment', 'keep preview']);
  expect(state.triggers.every((trigger) => trigger.build_command === 'bash scripts/desk-unlock.sh && bun run build:cloudflare')).toBe(true);
  expect(state.writes.every((write) => !write.includes('/builds') || write.includes('/triggers/'))).toBe(true);
});

test('ambiguous production branches fail before any external write', async () => {
  const state = fixture();
  state.triggers[0].branch_includes = ['main', '*'];
  await expect(configureDeskHosted({ api: state.api, apply: true, deskKey: 'x'.repeat(64), setGitHubSecret: () => { throw new Error('Must not write'); } })).rejects.toThrow('exactly one');
  expect(state.writes).toEqual([]);
});
