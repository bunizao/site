import fs from 'node:fs';
import path from 'node:path';

import {
  parseIncidentMetadata,
  renderIncidentMarker,
  replaceIncidentMarker,
  resolveIncidentPolicy,
} from './ops-health-incident-policy.mjs';

const MARKER_PREFIX = '<!-- ops-health-incident';

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function formatList(items, fallback) {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  return items.map((item) => `- ${item}`).join('\n');
}

export function parseCodexResult(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const unwrapped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(unwrapped);
  } catch {
    return null;
  }
}

export function buildIncidentReport({ codexResult, context, evidence, healthState, runUrl }) {
  const codexSection = codexResult
    ? [
        '## Codex triage',
        '',
        `**Disposition:** ${codexResult.disposition}`,
        `**Classification:** ${codexResult.classification}`,
        `**Confidence:** ${codexResult.confidence}`,
        `**Repository scope:** ${codexResult.repositoryScope}`,
        '',
        codexResult.summary,
        '',
        '### Evidence',
        '',
        formatList(codexResult.evidence, '- No evidence supplied.'),
        '',
        '### Likely causes',
        '',
        formatList(codexResult.likelyCauses, '- Unknown.'),
        '',
        '### Affected files',
        '',
        formatList(codexResult.affectedFiles, '- No repository file identified.'),
        '',
        '### Next checks',
        '',
        formatList(codexResult.nextChecks, '- Inspect the workflow run.'),
      ].join('\n')
    : [
        '## Codex triage',
        '',
        'Codex triage was unavailable or returned invalid structured output.',
      ].join('\n');

  return [
    `Run: [#${context.runNumber}](${runUrl})`,
    `Commit: \`${context.sha}\``,
    `Health state: \`${healthState}\``,
    '',
    '## Failed checks',
    '',
    formatList(evidence.failingTests, '- No failing test name was recovered from the job log.'),
    '',
    '## Observed errors',
    '',
    formatList(evidence.errors, '- No normalized error line was recovered.'),
    '',
    codexSection,
    '',
    '## Sanitized job log',
    '',
    '<details>',
    '<summary>Show log excerpt</summary>',
    '',
    '```text',
    String(evidence.log || '').replaceAll('```', '``\u200b`'),
    '```',
    '</details>',
    '',
    '_Codex triage is preliminary and does not confirm the root cause._',
  ].join('\n');
}

export async function getOpenIncidentState({ github, context }) {
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open',
    per_page: 100,
  });
  const issue = issues.find((candidate) => {
    return !candidate.pull_request && candidate.body?.includes(MARKER_PREFIX);
  }) || null;

  return {
    issue,
    metadata: parseIncidentMetadata(issue?.body),
  };
}

export async function syncOpsHealthIncident({ core, context, env, github, workspace }) {
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const healthState = env.HEALTH_STATE || 'unknown';
  const fingerprint = env.FINGERPRINT || '';
  const dryRun = env.DRY_RUN === 'true';
  const { issue, metadata: parsedMetadata } = await getOpenIncidentState({ github, context });
  const incidentMetadata = parsedMetadata || (issue
    ? {
        fingerprint: '',
        recoveryStreak: 0,
        lastSeenRun: '',
        analysisStatus: 'unavailable',
      }
    : null);
  const liveCodexResult = parseCodexResult(env.CODEX_FINAL_MESSAGE);
  const cachedCodexResult = readJson(env.CACHED_DECISION_PATH);
  const codexResult = liveCodexResult || cachedCodexResult;
  const evidence = readJson(env.EVIDENCE_PATH) || {
    errors: [],
    failingTests: [],
    log: 'Sanitized job evidence was unavailable.',
  };
  const policy = resolveIncidentPolicy({
    healthState,
    fingerprint,
    incidentMetadata,
    codexResult,
    dryRun,
  });
  const report = buildIncidentReport({
    codexResult,
    context,
    evidence,
    healthState,
    runUrl,
  });

  core.setOutput('gate', policy.gate);
  core.setOutput('cache_ignore', 'false');
  await core.summary
    .addHeading(`Ops Health: ${healthState}`)
    .addRaw(`Policy: ${policy.action} — ${policy.reason}\n\n`)
    .addRaw(codexResult?.summary || 'No Codex analysis was produced.')
    .write();

  if (policy.action === 'dry-run' || policy.action === 'noop') {
    return;
  }

  if (policy.action === 'ignore') {
    if (liveCodexResult) {
      const decisionPath = path.join(workspace, '.ops-health-cache/ignored-decision.json');
      fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
      fs.writeFileSync(decisionPath, `${JSON.stringify(liveCodexResult, null, 2)}\n`);
      core.setOutput('cache_ignore', 'true');
    }
    if (issue && incidentMetadata.recoveryStreak > 0) {
      await github.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issue.number,
        body: replaceIncidentMarker(issue.body, {
          ...incidentMetadata,
          recoveryStreak: 0,
          lastSeenRun: String(context.runId),
        }),
      });
    }
    return;
  }

  if (policy.action === 'reset-recovery' && issue) {
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: replaceIncidentMarker(issue.body, {
        ...incidentMetadata,
        recoveryStreak: 0,
        lastSeenRun: String(context.runId),
      }),
    });
    return;
  }

  if (policy.action === 'mark-recovery' && issue) {
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: replaceIncidentMarker(issue.body, {
        ...incidentMetadata,
        recoveryStreak: 1,
        lastSeenRun: String(context.runId),
      }),
    });
    return;
  }

  if (policy.action === 'close' && issue) {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: `Ops Health recovered across two consecutive runs. Latest proof: [run #${context.runNumber}](${runUrl}).`,
    });
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      state: 'closed',
      state_reason: 'completed',
    });
    return;
  }

  const analysisStatus = codexResult ? 'complete' : 'unavailable';
  const currentMetadata = {
    fingerprint,
    recoveryStreak: 0,
    lastSeenRun: String(context.runId),
    analysisStatus,
  };

  if (policy.action === 'keep-open' && issue) {
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: replaceIncidentMarker(issue.body, {
        ...currentMetadata,
        analysisStatus: incidentMetadata.analysisStatus,
      }),
    });
    return;
  }

  if ((policy.action === 'update' || policy.action === 'backfill') && issue) {
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: [renderIncidentMarker(currentMetadata), '', report].join('\n'),
    });
    if (policy.action === 'update') {
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issue.number,
        body: `A new failure signature replaced the active incident details. See [run #${context.runNumber}](${runUrl}).`,
      });
    }
    return;
  }

  if (issue) {
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: replaceIncidentMarker(issue.body, currentMetadata),
    });
    return;
  }

  const primaryFailure = evidence.failingTests?.[0]
    || (healthState === 'infrastructure_failure'
      ? 'workflow infrastructure failure'
      : 'production checks failing');
  await github.rest.issues.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    title: `[Ops Health] ${primaryFailure}`.slice(0, 120),
    body: [renderIncidentMarker(currentMetadata), '', report].join('\n'),
  });
}
