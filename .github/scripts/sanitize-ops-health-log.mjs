import fs from 'node:fs';
import path from 'node:path';

const MAX_LOG_CHARACTERS = 30_000;

export function sanitizeOpsHealthLog(input) {
  const sanitized = input
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?\S+/gi, '$1***')
    .replace(/(telegram_bot_token\s*[:=]\s*)\S+/gi, '$1***')
    .replace(/\r\n/g, '\n')
    .trim();

  if (sanitized.length <= MAX_LOG_CHARACTERS) {
    return sanitized;
  }

  return [
    `[Earlier output omitted; showing the last ${MAX_LOG_CHARACTERS} characters.]`,
    sanitized.slice(-MAX_LOG_CHARACTERS),
  ].join('\n');
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node sanitize-ops-health-log.mjs <input> <output>');
  }

  const sanitized = sanitizeOpsHealthLog(fs.readFileSync(inputPath, 'utf8'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${sanitized}\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
