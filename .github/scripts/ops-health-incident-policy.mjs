const INCIDENT_MARKER_PATTERN = /<!-- ops-health-incident\n([\s\S]*?)\n-->/;
const IGNORABLE_CLASSIFICATIONS = new Set([
  'transient_false_positive',
  'workflow_infrastructure',
]);

export function parseIncidentMetadata(body) {
  const match = String(body || '').match(INCIDENT_MARKER_PATTERN);
  if (!match) return null;

  const fields = Object.fromEntries(match[1].split('\n').flatMap((line) => {
    const separator = line.indexOf(':');
    if (separator === -1) return [];
    return [[line.slice(0, separator).trim(), line.slice(separator + 1).trim()]];
  }));

  return {
    fingerprint: fields.fingerprint || '',
    recoveryStreak: Number.parseInt(fields['recovery-streak'], 10) || 0,
    lastSeenRun: fields['last-seen-run'] || '',
    analysisStatus: fields['analysis-status'] === 'complete' ? 'complete' : 'unavailable',
  };
}

export function renderIncidentMarker({ fingerprint, recoveryStreak, lastSeenRun, analysisStatus }) {
  return [
    '<!-- ops-health-incident',
    `fingerprint: ${fingerprint}`,
    `recovery-streak: ${recoveryStreak}`,
    `last-seen-run: ${lastSeenRun}`,
    `analysis-status: ${analysisStatus}`,
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
  incidentAnalysisStatus,
  cachedIgnore,
  dryRun,
}) {
  if (!['failing', 'infrastructure_failure'].includes(healthState)) {
    return false;
  }
  if (dryRun) return true;
  if (cachedIgnore) return false;
  return !incidentFingerprint
    || incidentFingerprint !== fingerprint
    || incidentAnalysisStatus !== 'complete';
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
    if (incidentMetadata.analysisStatus !== 'complete' && codexResult) {
      return { action: 'backfill', gate: 'fail', reason: 'Codex analysis recovered for the active incident.' };
    }
    return { action: 'keep-open', gate: 'fail', reason: 'Known failure signature remains active.' };
  }
  return { action: 'update', gate: 'fail', reason: 'A new failure signature appeared.' };
}
