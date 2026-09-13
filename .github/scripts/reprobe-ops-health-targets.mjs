import fs from 'node:fs';
import path from 'node:path';

const MAX_TARGETS = 3;
const TIMEOUT_MS = 10_000;
const SENSITIVE_QUERY_PARAMETER = /^(?:access_token|api_key|key|secret|signature|token)$/i;
/** @type {(input: string, init?: RequestInit) => Promise<Response>} */
const defaultFetch = (input, init) => fetch(input, init);

function isSafePublicTarget(value) {
  try {
    const url = new URL(value);
    const allowedHost = url.hostname === 'buxx.me' || url.hostname.endsWith('.buxx.me');
    const hasSensitiveQuery = [...url.searchParams.keys()].some((key) => {
      return SENSITIVE_QUERY_PARAMETER.test(key);
    });
    return url.protocol === 'https:'
      && allowedHost
      && !url.username
      && !url.password
      && !hasSensitiveQuery;
  } catch {
    return false;
  }
}

export function collectProbeTargets(evidence) {
  const targets = evidence?.failureOccurrences?.map((occurrence) => occurrence.target) ?? [];
  return [...new Set(targets.filter(isSafePublicTarget))].slice(0, MAX_TARGETS);
}

export async function reprobeOpsHealthTargets(evidence, fetchImpl = defaultFetch) {
  const probes = [];
  for (const target of collectProbeTargets(evidence)) {
    const startedAt = performance.now();
    try {
      const response = await fetchImpl(target, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'site-ops-health-reprobe/1.0' },
      });
      await response.body?.cancel();
      probes.push({
        target,
        ok: response.ok,
        status: response.status,
        finalUrl: response.url || target,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      probes.push({
        target,
        ok: false,
        error: {
          name: error?.name ?? 'Error',
          code: error?.code ?? '',
          message: error?.message ?? String(error),
        },
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  }

  return {
    transport: 'node-fetch',
    probes,
  };
}

async function main() {
  const [, , evidencePath, outputPath] = process.argv;
  if (!evidencePath || !outputPath) {
    throw new Error('Usage: node reprobe-ops-health-targets.mjs <evidence> <output>');
  }

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const result = await reprobeOpsHealthTargets(evidence);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await main();
}
