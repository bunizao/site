import { describe, expect, test } from 'bun:test';

import { resolveTrackerPolicy } from '../../.github/scripts/lighthouse-tracker-policy.mjs';

describe('Lighthouse tracker policy', () => {
  test('notifies immediately when a production push is abnormal', () => {
    expect(resolveTrackerPolicy({
      anomaly: true,
      eventName: 'push',
      currentSha: 'current',
    })).toEqual({
      closeRecovery: false,
      notifyAnomaly: true,
      reason: 'push anomaly',
    });
  });

  test('suppresses the first scheduled anomaly on a commit', () => {
    expect(resolveTrackerPolicy({
      anomaly: true,
      eventName: 'schedule',
      currentSha: 'current',
      previousAnomaly: false,
      previousSha: 'current',
    })).toEqual({
      closeRecovery: false,
      notifyAnomaly: false,
      reason: 'scheduled anomaly awaiting confirmation',
    });
  });

  test('notifies after two scheduled anomalies on the same commit', () => {
    expect(resolveTrackerPolicy({
      anomaly: true,
      eventName: 'schedule',
      currentSha: 'current',
      previousAnomaly: true,
      previousSha: 'current',
    })).toEqual({
      closeRecovery: false,
      notifyAnomaly: true,
      reason: 'confirmed scheduled anomaly',
    });
  });

  test('does not carry a scheduled anomaly across deployments', () => {
    expect(resolveTrackerPolicy({
      anomaly: true,
      eventName: 'schedule',
      currentSha: 'current',
      previousAnomaly: true,
      previousSha: 'previous',
    })).toEqual({
      closeRecovery: false,
      notifyAnomaly: false,
      reason: 'scheduled anomaly awaiting confirmation',
    });
  });

  test('closes an open tracker after any healthy run', () => {
    expect(resolveTrackerPolicy({
      anomaly: false,
      eventName: 'schedule',
      currentSha: 'current',
      previousAnomaly: true,
      previousSha: 'current',
    })).toEqual({
      closeRecovery: true,
      notifyAnomaly: false,
      reason: 'healthy run',
    });
  });
});
