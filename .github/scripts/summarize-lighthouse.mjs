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

function median(values) {
  const nums = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  if (nums.length === 0) return undefined;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function formatScoreCell(score, threshold) {
  if (typeof score !== 'number') return '❌ n/a';
  const percent = scorePercent(score);
  return score >= threshold ? `✅ ${percent}` : `❌ ${percent}`;
}

function formatMetric(value, auditId) {
  if (typeof value !== 'number') return 'n/a';
  if (auditId === 'cumulative-layout-shift') return value.toFixed(3);
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function formatMetricCell(value, threshold, auditId) {
  const formatted = formatMetric(value, auditId);
  if (typeof value !== 'number') return `❌ ${formatted}`;
  return value <= threshold ? `✅ ${formatted}` : `❌ ${formatted}`;
}

function formatCategoryName(category) {
  const names = {
    performance: 'Performance',
    accessibility: 'Accessibility',
    'best-practices': 'Best Practices',
    seo: 'SEO',
  };
  return names[category] || category;
}

function formatAuditName(auditId) {
  const names = {
    'first-contentful-paint': 'FCP',
    'largest-contentful-paint': 'LCP',
    'total-blocking-time': 'TBT',
    'cumulative-layout-shift': 'CLS',
  };
  return names[auditId] || auditId;
}

function markdownLink(url) {
  return `[${url}](${url})`;
}

function compactLines(lines) {
  return lines.filter((line) => line !== null && line !== undefined);
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
  const lines = compactLines([
    '## Lighthouse report',
    '',
    '> ❌ Lighthouse did not produce a manifest. Treat this as abnormal because the deployment was not measured.',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Deployment | ${process.env.LHCI_DEPLOYMENT_URL ? markdownLink(process.env.LHCI_DEPLOYMENT_URL) : 'unknown'} |`,
    `| Environment | ${process.env.LHCI_ENVIRONMENT || 'unknown'} |`,
    runUrl ? `| Workflow | ${markdownLink(runUrl)} |` : null,
  ]);

  return {
    anomaly: true,
    markdown: `${lines.join('\n')}\n`,
  };
}

function buildSummary() {
  const manifestPath = manifestCandidates.find((filePath) => fs.existsSync(filePath));
  if (!manifestPath) return buildMissingManifestSummary();

  const manifest = readJson(manifestPath);
  // Gate on the median of EACH metric across all runs, not on a single
  // "representative" run. Lighthouse's simulated throttling amplifies the
  // runner's CPU jitter, so any one run can spike LCP/CLS/TBT well past the
  // others; reporting one run's snapshot let that noise flap the gate. A
  // per-metric median is the objective signal.
  const runsByUrl = new Map();
  for (const entry of manifest) {
    if (!runsByUrl.has(entry.url)) runsByUrl.set(entry.url, []);
    runsByUrl.get(entry.url).push(entry);
  }

  const rows = [];
  const anomalies = [];

  for (const [url, urlEntries] of runsByUrl) {
    const reports = urlEntries
      .map((entry) => resolveReportPath(entry.jsonPath))
      .filter((reportPath) => reportPath && fs.existsSync(reportPath))
      .map((reportPath) => readJson(reportPath));

    if (reports.length === 0) {
      anomalies.push(`${url}: missing JSON report`);
      rows.push([url, 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'Fail']);
      continue;
    }

    const categoryMedian = (category) => median(reports.map((report) => report.categories?.[category]?.score));
    const auditMedian = (auditId) => median(reports.map((report) => report.audits?.[auditId]?.numericValue));

    const rowFailures = [];
    const categoryThresholds = getCategoryThresholds(url);

    for (const [category, threshold] of Object.entries(categoryThresholds)) {
      const score = categoryMedian(category);
      if (typeof score !== 'number' || score < threshold) {
        rowFailures.push(`${formatCategoryName(category)} ${scorePercent(score)} < ${scorePercent(threshold)}`);
      }
    }

    for (const [auditId, threshold] of Object.entries(metricThresholds)) {
      const value = auditMedian(auditId);
      if (typeof value !== 'number' || value > threshold) {
        rowFailures.push(`${formatAuditName(auditId)} ${formatMetric(value, auditId)} > ${formatMetric(threshold, auditId)}`);
      }
    }

    if (rowFailures.length > 0) {
      anomalies.push(`${url}: ${rowFailures.join(', ')}`);
    }

    rows.push([
      url,
      formatScoreCell(categoryMedian('performance'), categoryThresholds.performance),
      formatScoreCell(categoryMedian('accessibility'), categoryThresholds.accessibility),
      formatScoreCell(categoryMedian('best-practices'), categoryThresholds['best-practices']),
      typeof categoryThresholds.seo === 'number' ? formatScoreCell(categoryMedian('seo'), categoryThresholds.seo) : 'Not gated',
      formatMetricCell(auditMedian('first-contentful-paint'), metricThresholds['first-contentful-paint'], 'first-contentful-paint'),
      formatMetricCell(auditMedian('largest-contentful-paint'), metricThresholds['largest-contentful-paint'], 'largest-contentful-paint'),
      formatMetricCell(auditMedian('total-blocking-time'), metricThresholds['total-blocking-time'], 'total-blocking-time'),
      formatMetricCell(auditMedian('cumulative-layout-shift'), metricThresholds['cumulative-layout-shift'], 'cumulative-layout-shift'),
      rowFailures.length > 0 ? '❌ Fail' : '✅ Pass',
    ]);
  }

  const runUrl = getRunUrl();
  const lines = compactLines([
    '## Lighthouse report',
    '',
    anomalies.length > 0 ? '> ❌ **Action needed.** One or more Lighthouse gates failed.' : '> ✅ **Healthy.** The latest deployment is inside the Lighthouse gates.',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Deployment | ${process.env.LHCI_DEPLOYMENT_URL ? markdownLink(process.env.LHCI_DEPLOYMENT_URL) : 'unknown'} |`,
    `| Environment | ${process.env.LHCI_ENVIRONMENT || 'unknown'} |`,
    process.env.GITHUB_SHA ? `| Commit | \`${process.env.GITHUB_SHA.slice(0, 12)}\` |` : null,
    runUrl ? `| Workflow | ${markdownLink(runUrl)} |` : null,
    '',
    '### Gate summary',
    '',
    '- Performance must be at least 75.',
    '- Accessibility, Best Practices, and canonical-host SEO must be at least 90.',
    '- FCP must be at most 3s, LCP at most 4s, TBT at most 300ms, and CLS at most 0.1.',
    '- SEO is only gated on `buxx.me`; preview URLs are not meaningful SEO targets.',
    '',
    '### Audited URLs',
    '',
    '| URL | Perf | A11y | Best | SEO | FCP | LCP | TBT | CLS | Result |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows.map((row) => `| ${markdownLink(row[0])} | ${row.slice(1).join(' | ')} |`),
  ]);

  if (anomalies.length > 0) {
    lines.push('', '### Failed gates', '', ...anomalies.map((item) => `- ${item}`));
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
