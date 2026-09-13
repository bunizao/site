import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_LOG_CHARACTERS = 10_000;
const FAILURE_CONTEXT_LINES = 24;
const MAX_FAILURE_OCCURRENCES = 8;

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

function extractRuntime(lines) {
  const bunVersion = lines
    .map(normalizeEvidenceLine)
    .map((line) => line.match(/\bbun test v([^\s(]+)/i)?.[1] ?? '')
    .find(Boolean) ?? '';

  return { bunVersion };
}

function extractOutcomes(lines) {
  const outcomes = {};
  for (const line of lines.map(normalizeEvidenceLine)) {
    const match = line.match(/^(PRIMARY_OUTCOME|CONFIRM_OUTCOME):\s*(\S+)$/);
    if (!match) continue;
    outcomes[match[1] === 'PRIMARY_OUTCOME' ? 'primary' : 'confirmation'] = match[2];
  }
  return outcomes;
}

function findFailureMessage(lines) {
  const candidates = [...lines].reverse();
  return candidates.find((line) => /^(?:TypeError|Error):\s+/i.test(line))
    ?? candidates.find((line) => /^error:\s+/i.test(line) && !/^error:\s+script\s+/i.test(line))
    ?? '';
}

function findLastMatch(lines, pattern) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(pattern);
    if (match) return match[1];
  }
  return '';
}

function extractFailureOccurrences(lines) {
  const occurrences = [];
  let runNumber = 0;
  let runStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (/##\[group\]Run bun run test:ops\b/.test(lines[index])) {
      runNumber += 1;
      runStart = index;
    }

    const failure = normalizeEvidenceLine(lines[index]).match(/^\(fail\)\s+(.+)$/);
    if (!failure || occurrences.length >= MAX_FAILURE_OCCURRENCES) continue;

    const context = lines
      .slice(Math.max(runStart, index - FAILURE_CONTEXT_LINES), index + 1)
      .map(normalizeEvidenceLine)
      .filter(Boolean);
    const contextText = context.join('\n');
    const code = findLastMatch(context, /\bcode:\s*["']?([^"'\s]+)/i);
    const target = findLastMatch(context, /\bpath:\s*["']?(https:\/\/[^"'\s]+)/i);

    occurrences.push({
      phase: runNumber === 1 ? 'primary' : runNumber === 2 ? 'confirmation' : 'unknown',
      test: failure[1],
      message: findFailureMessage(context),
      code,
      target,
      excerpt: contextText,
    });
  }

  return occurrences;
}

function renderFocusedLog(redacted, runtime, outcomes, failureOccurrences) {
  if (failureOccurrences.length === 0) {
    return truncateOpsHealthLog(redacted);
  }

  const header = [
    runtime.bunVersion ? `Bun runtime: ${runtime.bunVersion}` : '',
    Object.keys(outcomes).length > 0
      ? `Outcomes: primary=${outcomes.primary ?? 'unknown'}, confirmation=${outcomes.confirmation ?? 'unknown'}`
      : '',
  ].filter(Boolean);
  const failures = failureOccurrences.map((occurrence) => [
    `## ${occurrence.phase}: ${occurrence.test}`,
    occurrence.excerpt,
  ].join('\n'));

  return [...header, ...failures].join('\n\n');
}

export function sanitizeOpsHealthLog(input) {
  return truncateOpsHealthLog(redactOpsHealthLog(input));
}

export function extractOpsHealthEvidence(input, healthState) {
  const redacted = redactOpsHealthLog(input);
  const rawLines = redacted.split('\n');
  const lines = rawLines
    .map(normalizeEvidenceLine)
    .filter(Boolean);
  const runtime = extractRuntime(rawLines);
  const outcomes = extractOutcomes(rawLines);
  const failureOccurrences = extractFailureOccurrences(rawLines);
  const failingTests = unique(lines.flatMap((line) => {
    const match = line.match(/^\(fail\)\s+(.+)$/);
    return match ? [match[1]] : [];
  }));
  const errors = unique([
    ...failureOccurrences.flatMap(({ message, code, target }) => [
      message,
      code ? `code: ${code}` : '',
      target ? `path: ${target}` : '',
    ]),
    ...lines.filter((line) => {
      return /^(?:error:|fatal:|expected:|received:|process completed|the hosted runner|unable to resolve)/i.test(line);
    }),
  ]).slice(0, 12);
  const failureSignatures = failureOccurrences.map(({ test, message, code }) => ({
    test,
    message,
    code,
  }));
  const fingerprintEvidence = failureSignatures.length > 0
    ? failureSignatures
    : errors.length > 0
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
    runtime,
    outcomes,
    failureOccurrences,
    log: renderFocusedLog(redacted, runtime, outcomes, failureOccurrences),
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
