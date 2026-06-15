import { appendFileSync, readFileSync } from 'node:fs';

const outputFile = process.argv[2];

if (!outputFile) {
  throw new Error('Usage: node read-wrangler-preview-url.mjs <wrangler-output-file>');
}

const output = readFileSync(outputFile, 'utf8');
const previewAlias = process.env.PREVIEW_ALIAS?.trim();
const workerName = process.env.WORKER_NAME?.trim();
const urls = [...output.matchAll(/https:\/\/[^\s<>)"']+/g)].map((match) =>
  match[0].replace(/[.,;:]+$/, '')
);

const previewUrls = urls.filter((url) => {
  try {
    const { hostname } = new URL(url);
    return hostname.endsWith('.workers.dev') && (!workerName || hostname.includes(`-${workerName}.`));
  } catch {
    return false;
  }
});

const selectedUrl =
  (previewAlias && previewUrls.find((url) => new URL(url).hostname.startsWith(`${previewAlias}-`))) ||
  previewUrls[0];

if (!selectedUrl) {
  throw new Error('Wrangler did not print a Cloudflare Workers preview URL.');
}

const previewUrl = selectedUrl.endsWith('/') ? selectedUrl : `${selectedUrl}/`;

console.log(previewUrl);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${previewUrl}\n`);
}
