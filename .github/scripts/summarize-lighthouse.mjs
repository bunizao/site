import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getCategoryThresholds, metricThresholds } = require('../lighthouse/thresholds.cjs');

const workspace = process.cwd();
const lighthouseDir = path.join(workspace, '.lighthouseci');
const manifestCandidates = [
  path.join(lighthouseDir, 'manifest.json'),
  path.join(lighthouseDir, 'reports', 'manifest.json'),
];
const summaryPath = path.join(lighthouseDir, 'summary.md');
const resultPath = path.join(lighthouseDir, 'summary.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveReportPath(reportPath) {
  if (!reportPath) return null;
  return path.isAbsolute(reportPath) ? reportPath : path.resolve(workspace, reportPath);
}

function scorePercent(score) {
  return typeof score === 'number' ? Math.round(score * 100) : 'n/a';
}

function formatMetric(value, auditId) {
  if (typeof value !== 'number') return 'n/a';
  if (auditId === 'cumulative-layout-shift') return value.toFixed(3);
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function markdownLink(url) {
  return `[${url}](${url})`;
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function getRunUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return server && repo && runId ? `${server}/${repo}/actions/runs/${runId}` : '';
}

function buildMissingManifestSummary() {
  const runUrl = getRunUrl();
  const lines = [
    '## Lighthouse result',
    '',
    'Lighthouse did not produce a manifest. Treat this as an abnormal run because the deployed site was not measured.',
    '',
    `Deployment: ${process.env.LHCI_DEPLOYMENT_URL || 'unknown'}`,
    `Environment: ${process.env.LHCI_ENVIRONMENT || 'unknown'}`,
    runUrl ? `Workflow: ${markdownLink(runUrl)}` : '',
  ].filter(Boolean);

  return {
    anomaly: true,
    markdown: `${lines.join('\n')}\n`,
  };
}

function buildSummary() {
  const manifestPath = manifestCandidates.find((filePath) => fs.existsSync(filePath));
  if (!manifestPath) return buildMissingManifestSummary();

  const manifest = readJson(manifestPath);
  const representatives = manifest.filter((entry) => entry.isRepresentativeRun);
  const entries = representatives.length > 0 ? representatives : manifest;
  const rows = [];
  const anomalies = [];

  for (const entry of entries) {
    const reportPath = resolveReportPath(entry.jsonPath);
    if (!reportPath || !fs.existsSync(reportPath)) {
      anomalies.push(`${entry.url}: missing JSON report`);
      rows.push([entry.url, 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'Fail']);
      continue;
    }

    const report = readJson(reportPath);
    const categories = report.categories || {};
    const audits = report.audits || {};
    const rowFailures = [];
    const categoryThresholds = getCategoryThresholds(entry.url);

    for (const [category, threshold] of Object.entries(categoryThresholds)) {
      const score = categories[category]?.score;
      if (typeof score !== 'number' || score < threshold) {
        rowFailures.push(`${category} ${scorePercent(score)} < ${scorePercent(threshold)}`);
      }
    }

    for (const [auditId, threshold] of Object.entries(metricThresholds)) {
      const value = audits[auditId]?.numericValue;
      if (typeof value !== 'number' || value > threshold) {
        rowFailures.push(`${auditId} ${formatMetric(value, auditId)} > ${formatMetric(threshold, auditId)}`);
      }
    }

    if (rowFailures.length > 0) {
      anomalies.push(`${entry.url}: ${rowFailures.join(', ')}`);
    }

    rows.push([
      entry.url,
      scorePercent(categories.performance?.score),
      scorePercent(categories.accessibility?.score),
      scorePercent(categories['best-practices']?.score),
      scorePercent(categories.seo?.score),
      formatMetric(audits['first-contentful-paint']?.numericValue, 'first-contentful-paint'),
      formatMetric(audits['largest-contentful-paint']?.numericValue, 'largest-contentful-paint'),
      formatMetric(audits['total-blocking-time']?.numericValue, 'total-blocking-time'),
      formatMetric(audits['cumulative-layout-shift']?.numericValue, 'cumulative-layout-shift'),
      rowFailures.length > 0 ? 'Fail' : 'Pass',
    ]);
  }

  const runUrl = getRunUrl();
  const lines = [
    '## Lighthouse result',
    '',
    anomalies.length > 0 ? 'Status: abnormal.' : 'Status: healthy.',
    '',
    `Deployment: ${process.env.LHCI_DEPLOYMENT_URL || 'unknown'}`,
    `Environment: ${process.env.LHCI_ENVIRONMENT || 'unknown'}`,
    process.env.GITHUB_SHA ? `Commit: ${process.env.GITHUB_SHA}` : '',
    runUrl ? `Workflow: ${markdownLink(runUrl)}` : '',
    '',
    'Abnormal means any audited URL misses one of these gates: performance < 75, accessibility < 90, best practices < 90, SEO < 90, FCP > 3s, LCP > 4s, TBT > 300ms, or CLS > 0.1.',
    'SEO is only gated on the canonical production host, because Vercel preview and deployment URLs are not meaningful SEO targets.',
    '',
    '| URL | Perf | A11y | Best | SEO | FCP | LCP | TBT | CLS | Result |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows.map((row) => `| ${markdownLink(row[0])} | ${row.slice(1).join(' | ')} |`),
  ].filter(Boolean);

  if (anomalies.length > 0) {
    lines.push('', '### Failures', ...anomalies.map((item) => `- ${item}`));
  }

  return {
    anomaly: anomalies.length > 0,
    markdown: `${lines.join('\n')}\n`,
  };
}

fs.mkdirSync(lighthouseDir, { recursive: true });
const summary = buildSummary();
fs.writeFileSync(summaryPath, summary.markdown);
fs.writeFileSync(resultPath, `${JSON.stringify({ anomaly: summary.anomaly }, null, 2)}\n`);
writeOutput('anomaly', String(summary.anomaly));

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.markdown);
}

process.stdout.write(summary.markdown);
