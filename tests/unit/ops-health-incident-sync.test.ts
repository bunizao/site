import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderIncidentMarker } from '../../.github/scripts/ops-health-incident-policy.mjs';
import {
  buildIncidentReport,
  parseCodexResult,
  syncOpsHealthIncident,
} from '../../.github/scripts/sync-ops-health-incident.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createWorkspace() {
  const workspace = mkdtempSync(join(tmpdir(), 'ops-health-sync-'));
  const evidenceDirectory = join(workspace, '.ops-health');
  temporaryDirectories.push(workspace);
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(join(evidenceDirectory, 'evidence.json'), JSON.stringify({
    errors: ['Received: 0'],
    failingTests: ['hd image health > latest mood image URLs are readable'],
    log: 'sanitized failure log',
  }));
  return workspace;
}

function createCodexResult(overrides: Record<string, unknown> = {}) {
  return {
    disposition: 'incident',
    classification: 'product_regression',
    confidence: 'high',
    summary: 'The health check found a real production regression.',
    repositoryScope: 'site',
    evidence: ['The assertion received zero image posts.'],
    likelyCauses: ['The latest feed has no image-bearing posts.'],
    affectedFiles: ['tests/ops/hd-image-health.test.ts'],
    nextChecks: ['Inspect the latest mood API response.'],
    ...overrides,
  };
}

function createHarness(issues: Array<Record<string, unknown>> = []) {
  const outputs: Record<string, string> = {};
  const created: Array<Record<string, unknown>> = [];
  const comments: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const summary = {
    addHeading() { return this; },
    addRaw() { return this; },
    async write() {},
  };

  return {
    comments,
    core: {
      setOutput(name: string, value: string) { outputs[name] = value; },
      summary,
    },
    created,
    github: {
      async paginate() { return issues; },
      rest: {
        issues: {
          async create(input: Record<string, unknown>) { created.push(input); },
          async createComment(input: Record<string, unknown>) { comments.push(input); },
          async listForRepo() {},
          async update(input: Record<string, unknown>) { updates.push(input); },
        },
      },
    },
    outputs,
    updates,
  };
}

const context = {
  repo: { owner: 'bunizao', repo: 'site' },
  runId: 42,
  runNumber: 7,
  serverUrl: 'https://github.com',
  sha: 'abc123',
};

describe('Ops Health incident sync', () => {
  test('parses fenced structured Codex output', () => {
    expect(parseCodexResult('```json\n{"disposition":"incident"}\n```')).toEqual({
      disposition: 'incident',
    });
    expect(parseCodexResult('not json')).toBeNull();
  });

  test('renders repository evidence into the issue report', () => {
    const report = buildIncidentReport({
      codexResult: createCodexResult(),
      context,
      evidence: {
        errors: ['Received: 0'],
        failingTests: ['hd image health'],
        log: 'failure log',
      },
      healthState: 'failing',
      runUrl: 'https://github.com/bunizao/site/actions/runs/42',
    });

    expect(report).toContain('tests/ops/hd-image-health.test.ts');
    expect(report).toContain('Received: 0');
    expect(report).toContain('failure log');
  });

  test('caches a high-confidence ignored failure without creating an issue', async () => {
    const workspace = createWorkspace();
    const harness = createHarness();
    const ignored = createCodexResult({
      disposition: 'ignore',
      classification: 'workflow_infrastructure',
      summary: 'The hosted runner failed before the checks started.',
    });

    await syncOpsHealthIncident({
      ...harness,
      context,
      env: {
        CACHED_DECISION_PATH: join(workspace, '.ops-health-cache/ignored-decision.json'),
        CODEX_FINAL_MESSAGE: JSON.stringify(ignored),
        DRY_RUN: 'false',
        EVIDENCE_PATH: join(workspace, '.ops-health/evidence.json'),
        FINGERPRINT: 'infra',
        HEALTH_STATE: 'infrastructure_failure',
      },
      workspace,
    });

    const decisionPath = join(workspace, '.ops-health-cache/ignored-decision.json');
    expect(harness.outputs).toMatchObject({ cache_ignore: 'true', gate: 'pass' });
    expect(harness.created).toEqual([]);
    expect(existsSync(decisionPath)).toBe(true);
    expect(JSON.parse(readFileSync(decisionPath, 'utf8')).disposition).toBe('ignore');
  });

  test('backfills recovered Codex analysis into the issue body', async () => {
    const workspace = createWorkspace();
    const body = [renderIncidentMarker({
      analysisStatus: 'unavailable',
      fingerprint: 'failure',
      lastSeenRun: '40',
      recoveryStreak: 0,
    }), '', 'Codex triage was unavailable.'].join('\n');
    const harness = createHarness([{ body, number: 12 }]);

    await syncOpsHealthIncident({
      ...harness,
      context,
      env: {
        CACHED_DECISION_PATH: join(workspace, '.ops-health-cache/ignored-decision.json'),
        CODEX_FINAL_MESSAGE: JSON.stringify(createCodexResult({ summary: 'Recovered analysis.' })),
        DRY_RUN: 'false',
        EVIDENCE_PATH: join(workspace, '.ops-health/evidence.json'),
        FINGERPRINT: 'failure',
        HEALTH_STATE: 'failing',
      },
      workspace,
    });

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0].body).toContain('analysis-status: complete');
    expect(harness.updates[0].body).toContain('Recovered analysis.');
    expect(harness.updates[0].body).not.toContain('Codex triage was unavailable.');
  });

  test('replaces stale issue details when the failure signature changes', async () => {
    const workspace = createWorkspace();
    const body = [renderIncidentMarker({
      analysisStatus: 'complete',
      fingerprint: 'old',
      lastSeenRun: '40',
      recoveryStreak: 0,
    }), '', 'Old failure details.'].join('\n');
    const harness = createHarness([{ body, number: 12 }]);

    await syncOpsHealthIncident({
      ...harness,
      context,
      env: {
        CACHED_DECISION_PATH: join(workspace, '.ops-health-cache/ignored-decision.json'),
        CODEX_FINAL_MESSAGE: JSON.stringify(createCodexResult({ summary: 'New failure details.' })),
        DRY_RUN: 'false',
        EVIDENCE_PATH: join(workspace, '.ops-health/evidence.json'),
        FINGERPRINT: 'new',
        HEALTH_STATE: 'failing',
      },
      workspace,
    });

    expect(harness.updates[0].body).toContain('fingerprint: new');
    expect(harness.updates[0].body).toContain('New failure details.');
    expect(harness.updates[0].body).not.toContain('Old failure details.');
    expect(harness.comments).toHaveLength(1);
  });
});
