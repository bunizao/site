import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @param {{
 *   anomaly: boolean,
 *   eventName: string,
 *   currentSha: string,
 *   previousAnomaly?: boolean,
 *   previousSha?: string,
 * }} input
 */
export function resolveTrackerPolicy({
  anomaly,
  eventName,
  currentSha,
  previousAnomaly = undefined,
  previousSha = undefined,
}) {
  if (!anomaly) {
    return {
      closeRecovery: true,
      notifyAnomaly: false,
      reason: 'healthy run',
    };
  }

  if (eventName !== 'schedule') {
    return {
      closeRecovery: false,
      notifyAnomaly: true,
      reason: 'push anomaly',
    };
  }

  if (previousSha === currentSha && previousAnomaly === true) {
    return {
      closeRecovery: false,
      notifyAnomaly: true,
      reason: 'confirmed scheduled anomaly',
    };
  }

  return {
    closeRecovery: false,
    notifyAnomaly: false,
    reason: 'scheduled anomaly awaiting confirmation',
  };
}

function readAnomaly(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).anomaly === true;
  } catch {
    return fallback;
  }
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function main() {
  const policy = resolveTrackerPolicy({
    anomaly: readAnomaly(process.env.CURRENT_LIGHTHOUSE_SUMMARY_PATH, true),
    eventName: process.env.GITHUB_EVENT_NAME || '',
    currentSha: process.env.GITHUB_SHA || '',
    previousAnomaly: readAnomaly(process.env.PREVIOUS_LIGHTHOUSE_SUMMARY_PATH, undefined),
    previousSha: process.env.PREVIOUS_SCHEDULED_SHA,
  });

  writeOutput('notify_anomaly', String(policy.notifyAnomaly));
  writeOutput('close_recovery', String(policy.closeRecovery));
  writeOutput('reason', policy.reason);
  process.stdout.write(`Lighthouse tracker policy: ${policy.reason}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
