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
        rowFailures.push(`${formatCategoryName(category)} ${scorePercent(score)} < ${scorePercent(threshold)}`);
      }
    }

    for (const [auditId, threshold] of Object.entries(metricThresholds)) {
      const value = audits[auditId]?.numericValue;
      if (typeof value !== 'number' || value > threshold) {
        rowFailures.push(`${formatAuditName(auditId)} ${formatMetric(value, auditId)} > ${formatMetric(threshold, auditId)}`);
      }
    }

    if (rowFailures.length > 0) {
      anomalies.push(`${entry.url}: ${rowFailures.join(', ')}`);
    }

    rows.push([
      entry.url,
      formatScoreCell(categories.performance?.score, categoryThresholds.performance),
      formatScoreCell(categories.accessibility?.score, categoryThresholds.accessibility),
      formatScoreCell(categories['best-practices']?.score, categoryThresholds['best-practices']),
      typeof categoryThresholds.seo === 'number' ? formatScoreCell(categories.seo?.score, categoryThresholds.seo) : 'Not gated',
      formatMetricCell(
        audits['first-contentful-paint']?.numericValue,
        metricThresholds['first-contentful-paint'],
        'first-contentful-paint'
      ),
      formatMetricCell(
        audits['largest-contentful-paint']?.numericValue,
        metricThresholds['largest-contentful-paint'],
        'largest-contentful-paint'
      ),
      formatMetricCell(
        audits['total-blocking-time']?.numericValue,
        metricThresholds['total-blocking-time'],
        'total-blocking-time'
      ),
      formatMetricCell(
        audits['cumulative-layout-shift']?.numericValue,
        metricThresholds['cumulative-layout-shift'],
        'cumulative-layout-shift'
      ),
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
