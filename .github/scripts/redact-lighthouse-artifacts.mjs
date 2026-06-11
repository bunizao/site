import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), '.lighthouseci');
const secrets = (process.env.LIGHTHOUSE_ARTIFACT_REDACTIONS || '')
  .split(/\r?\n|,/)
  .map((value) => value.trim())
  .filter(Boolean);

if (secrets.length === 0) {
  process.exit(0);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function redact(filePath) {
  const ext = path.extname(filePath);
  if (!['.json', '.html', '.md'].includes(ext)) return;

  let content = fs.readFileSync(filePath, 'utf8');
  for (const secret of secrets) {
    content = content.split(secret).join('[REDACTED]');
    content = content.split(encodeURIComponent(secret)).join('[REDACTED]');
  }
  fs.writeFileSync(filePath, content);
}

for (const filePath of walk(root)) {
  redact(filePath);
}
