import { describe, expect, test } from 'bun:test';
import {
  parseIncidentMetadata,
  renderIncidentMarker,
  resolveCodexDisposition,
  resolveIncidentPolicy,
  shouldAnalyzeIncident,
} from '../../.github/scripts/ops-health-incident-policy.mjs';

describe('Ops Health incident policy', () => {
  test('round-trips incident metadata through the hidden marker', () => {
    const marker = renderIncidentMarker({
      fingerprint: 'abc123',
      recoveryStreak: 1,
      lastSeenRun: '42',
      analysisStatus: 'complete',
    });

    expect(parseIncidentMetadata(`${marker}\nVisible issue body`)).toEqual({
      fingerprint: 'abc123',
      recoveryStreak: 1,
      lastSeenRun: '42',
      analysisStatus: 'complete',
    });
  });

  test('runs Codex only for a new or changed failure signature', () => {
    expect(shouldAnalyzeIncident({
      healthState: 'failing',
      fingerprint: 'new',
      incidentFingerprint: '',
      incidentAnalysisStatus: '',
      cachedIgnore: false,
      dryRun: false,
    })).toBe(true);
    expect(shouldAnalyzeIncident({
      healthState: 'failing',
      fingerprint: 'same',
      incidentFingerprint: 'same',
      incidentAnalysisStatus: 'complete',
      cachedIgnore: false,
      dryRun: false,
    })).toBe(false);
    expect(shouldAnalyzeIncident({
      healthState: 'healthy',
      fingerprint: '',
      incidentFingerprint: 'old',
      incidentAnalysisStatus: 'complete',
      cachedIgnore: false,
      dryRun: true,
    })).toBe(false);
  });

  test('retries missing analysis but reuses cached ignore decisions', () => {
    expect(shouldAnalyzeIncident({
      healthState: 'failing',
      fingerprint: 'same',
      incidentFingerprint: 'same',
      incidentAnalysisStatus: 'unavailable',
      cachedIgnore: false,
      dryRun: false,
    })).toBe(true);
    expect(shouldAnalyzeIncident({
      healthState: 'infrastructure_failure',
      fingerprint: 'infra',
      incidentFingerprint: '',
      incidentAnalysisStatus: '',
      cachedIgnore: true,
      dryRun: false,
    })).toBe(false);
  });

  test('lets high-confidence Codex infrastructure decisions ignore a failure', () => {
    expect(resolveCodexDisposition({
      disposition: 'ignore',
      classification: 'workflow_infrastructure',
      confidence: 'high',
    })).toEqual({
      ignored: true,
      reason: 'Codex classified the failure as high-confidence workflow_infrastructure.',
    });
  });

  test('fails closed on uncertain or unsupported ignore decisions', () => {
    expect(resolveCodexDisposition({
      disposition: 'ignore',
      classification: 'product_regression',
      confidence: 'high',
    }).ignored).toBe(false);
    expect(resolveCodexDisposition({
      disposition: 'ignore',
      classification: 'workflow_infrastructure',
      confidence: 'medium',
    }).ignored).toBe(false);
    expect(resolveCodexDisposition(null).ignored).toBe(false);
  });

  test('keeps the workflow green when Codex ignores a confirmed false positive', () => {
    expect(resolveIncidentPolicy({
      healthState: 'infrastructure_failure',
      fingerprint: 'infra',
      incidentMetadata: null,
      codexResult: {
        disposition: 'ignore',
        classification: 'workflow_infrastructure',
        confidence: 'high',
      },
      dryRun: false,
    })).toMatchObject({ action: 'ignore', gate: 'pass' });
  });

  test('creates an incident when Codex is unavailable', () => {
    expect(resolveIncidentPolicy({
      healthState: 'failing',
      fingerprint: 'failure',
      incidentMetadata: null,
      codexResult: null,
      dryRun: false,
    })).toMatchObject({ action: 'create', gate: 'fail' });
  });

  test('fails a dry run when Codex integration is unavailable', () => {
    expect(resolveIncidentPolicy({
      healthState: 'failing',
      fingerprint: 'failure',
      incidentMetadata: null,
      codexResult: null,
      dryRun: true,
    })).toMatchObject({ action: 'dry-run', gate: 'fail' });
  });

  test('requires two healthy runs before closing an incident', () => {
    const first = resolveIncidentPolicy({
      healthState: 'healthy',
      fingerprint: '',
      incidentMetadata: {
        fingerprint: 'failure',
        recoveryStreak: 0,
        lastSeenRun: '40',
        analysisStatus: 'complete',
      },
      codexResult: null,
      dryRun: false,
    });
    const second = resolveIncidentPolicy({
      healthState: 'healthy',
      fingerprint: '',
      incidentMetadata: {
        fingerprint: 'failure',
        recoveryStreak: 1,
        lastSeenRun: '41',
        analysisStatus: 'complete',
      },
      codexResult: null,
      dryRun: false,
    });

    expect(first).toMatchObject({ action: 'mark-recovery', gate: 'pass' });
    expect(second).toMatchObject({ action: 'close', gate: 'pass' });
  });

  test('resets recovery when a flaky run breaks the healthy streak', () => {
    expect(resolveIncidentPolicy({
      healthState: 'flaky',
      fingerprint: 'failure',
      incidentMetadata: {
        fingerprint: 'failure',
        recoveryStreak: 1,
        lastSeenRun: '41',
        analysisStatus: 'complete',
      },
      codexResult: null,
      dryRun: false,
    })).toMatchObject({ action: 'reset-recovery', gate: 'pass' });
  });

  test('backfills recovered Codex analysis into an existing issue', () => {
    expect(resolveIncidentPolicy({
      healthState: 'failing',
      fingerprint: 'failure',
      incidentMetadata: {
        fingerprint: 'failure',
        recoveryStreak: 0,
        lastSeenRun: '41',
        analysisStatus: 'unavailable',
      },
      codexResult: {
        disposition: 'incident',
        classification: 'product_regression',
        confidence: 'high',
      },
      dryRun: false,
    })).toMatchObject({ action: 'backfill', gate: 'fail' });
  });
});
