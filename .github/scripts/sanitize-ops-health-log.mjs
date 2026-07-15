import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_LOG_CHARACTERS = 10_000;

function redactOpsHealthLog(input) {
  return input
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '***')
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1***')
    .replace(/(telegram_bot_token\s*[:=]\s*)\S+/gi, '$1***')
    .replace(/((?:cookie|set-cookie|x-api-key)\s*:\s*).*$/gim, '$1***')
    .replace(/([?&](?:access_token|api_key|key|secret|signature|token)=)[^&\s]+/gi, '$1***')
    .replace(/\r\n/g, '\n')
    .trim();
}

function truncateOpsHealthLog(input) {
  if (input.length <= MAX_LOG_CHARACTERS) {
    return input;
  }

  return [
    `[Earlier output omitted; showing the last ${MAX_LOG_CHARACTERS} characters.]`,
    input.slice(-MAX_LOG_CHARACTERS),
  ].join('\n');
}

function normalizeEvidenceLine(line) {
  return line
    .replace(/^\d{4}-\d{2}-\d{2}T\S+\s+/, '')
    .replace(/^##\[(?:error|warning)\]\s*/i, '')
    .replace(/\s+\[\d+(?:\.\d+)?m?s\]$/, '')
    .replace(/\/home\/runner\/work\/[^/]+\/[^/]+\//g, '')
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function sanitizeOpsHealthLog(input) {
  return truncateOpsHealthLog(redactOpsHealthLog(input));
}

export function extractOpsHealthEvidence(input, healthState) {
  const redacted = redactOpsHealthLog(input);
  const lines = redacted
    .split('\n')
    .map(normalizeEvidenceLine)
    .filter(Boolean);
  const failingTests = unique(lines.flatMap((line) => {
    const match = line.match(/^\(fail\)\s+(.+)$/);
    return match ? [match[1]] : [];
  }));
  const errors = unique(lines.filter((line) => {
    return /^(?:error:|fatal:|expected:|received:|process completed|the hosted runner|unable to resolve)/i.test(line);
  })).slice(0, 12);
  const fingerprintEvidence = errors.length > 0
    ? errors
    : lines.slice(-12);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({
      state: healthState,
      failingTests: [...failingTests].sort(),
      errors: fingerprintEvidence,
    }))
    .digest('hex');

  return {
    healthState,
    fingerprint,
    failingTests,
    errors,
    log: truncateOpsHealthLog(redacted),
  };
}

function main() {
  const [, , inputPath, logOutputPath, evidenceOutputPath, healthState = 'unknown'] = process.argv;
  if (!inputPath || !logOutputPath || !evidenceOutputPath) {
    throw new Error(
      'Usage: node sanitize-ops-health-log.mjs <input> <log-output> <evidence-output> [health-state]',
    );
  }

  const evidence = extractOpsHealthEvidence(fs.readFileSync(inputPath, 'utf8'), healthState);
  fs.mkdirSync(path.dirname(logOutputPath), { recursive: true });
  fs.mkdirSync(path.dirname(evidenceOutputPath), { recursive: true });
  fs.writeFileSync(logOutputPath, `${evidence.log}\n`);
  fs.writeFileSync(evidenceOutputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
