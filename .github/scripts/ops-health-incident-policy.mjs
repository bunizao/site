const INCIDENT_MARKER_PATTERN = /<!-- ops-health-incident\nfingerprint: ([^\n]*)\nrecovery-streak: (\d+)\nlast-seen-run: ([^\n]*)\n-->/;
const IGNORABLE_CLASSIFICATIONS = new Set([
  'transient_false_positive',
  'workflow_infrastructure',
]);

export function parseIncidentMetadata(body) {
  const match = String(body || '').match(INCIDENT_MARKER_PATTERN);
  if (!match) return null;

  return {
    fingerprint: match[1],
    recoveryStreak: Number.parseInt(match[2], 10) || 0,
    lastSeenRun: match[3],
  };
}

export function renderIncidentMarker({ fingerprint, recoveryStreak, lastSeenRun }) {
  return [
    '<!-- ops-health-incident',
    `fingerprint: ${fingerprint}`,
    `recovery-streak: ${recoveryStreak}`,
    `last-seen-run: ${lastSeenRun}`,
    '-->',
  ].join('\n');
}

export function replaceIncidentMarker(body, metadata) {
  const marker = renderIncidentMarker(metadata);
  const source = String(body || '');
  if (INCIDENT_MARKER_PATTERN.test(source)) {
    return source.replace(INCIDENT_MARKER_PATTERN, marker);
  }
  return `${marker}\n\n${source}`.trim();
}

export function shouldAnalyzeIncident({
  healthState,
  fingerprint,
  incidentFingerprint,
  dryRun,
}) {
  if (!['failing', 'infrastructure_failure'].includes(healthState)) {
    return false;
  }
  return dryRun || !incidentFingerprint || incidentFingerprint !== fingerprint;
}

export function resolveCodexDisposition(result) {
  if (!result || typeof result !== 'object') {
    return { ignored: false, reason: 'Codex output was unavailable or invalid.' };
  }

  const ignored = result.disposition === 'ignore'
    && result.confidence === 'high'
    && IGNORABLE_CLASSIFICATIONS.has(result.classification);

  if (ignored) {
    return {
      ignored: true,
      reason: `Codex classified the failure as high-confidence ${result.classification}.`,
    };
  }

  return {
    ignored: false,
    reason: 'Codex did not provide a high-confidence ignorable classification.',
  };
}

export function resolveIncidentPolicy({
  healthState,
  fingerprint,
  incidentMetadata,
  codexResult,
  dryRun,
}) {
  if (dryRun) {
    const unhealthy = ['failing', 'infrastructure_failure'].includes(healthState);
    if (unhealthy && !codexResult) {
      return {
        action: 'dry-run',
        gate: 'fail',
        reason: 'Manual dry run did not produce valid Codex output.',
      };
    }
    return { action: 'dry-run', gate: 'pass', reason: 'Manual dry run.' };
  }

  if (healthState === 'healthy') {
    if (!incidentMetadata) {
      return { action: 'noop', gate: 'pass', reason: 'Healthy with no open incident.' };
    }
    if (incidentMetadata.recoveryStreak >= 1) {
      return { action: 'close', gate: 'pass', reason: 'Second consecutive healthy run.' };
    }
    return { action: 'mark-recovery', gate: 'pass', reason: 'First healthy recovery run.' };
  }

  if (healthState === 'flaky') {
    if (incidentMetadata?.recoveryStreak > 0) {
      return { action: 'reset-recovery', gate: 'pass', reason: 'A flaky run broke the recovery streak.' };
    }
    return { action: 'noop', gate: 'pass', reason: 'Confirmation passed after an initial failure.' };
  }

  if (!['failing', 'infrastructure_failure'].includes(healthState)) {
    return { action: 'fail-closed', gate: 'fail', reason: `Unknown health state: ${healthState}.` };
  }

  const disposition = resolveCodexDisposition(codexResult);
  if (disposition.ignored) {
    return { action: 'ignore', gate: 'pass', reason: disposition.reason };
  }

  if (!incidentMetadata) {
    return { action: 'create', gate: 'fail', reason: disposition.reason };
  }
  if (incidentMetadata.fingerprint === fingerprint) {
    return { action: 'keep-open', gate: 'fail', reason: 'Known failure signature remains active.' };
  }
  return { action: 'update', gate: 'fail', reason: 'A new failure signature appeared.' };
}
