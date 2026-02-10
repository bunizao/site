interface Env {
  NOTIFY_BASE_URL: string;
  NOTIFY_CRON_SECRET: string;
  WORKER_MANUAL_TOKEN?: string;
}

interface TaskResult {
  path: string;
  ok: boolean;
  status: number;
  body: string;
  durationMs: number;
}

interface RunResult {
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  ok: boolean;
  results: TaskResult[];
}

const TASK_PATHS = ['/api/notify/schedule', '/api/notify/retry'];

function secureCompareText(input: string, expected: string): boolean {
  if (!input || !expected) return false;
  if (input.length !== expected.length) return false;

  let diff = 0;
  for (let index = 0; index < input.length; index += 1) {
    diff |= input.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return diff === 0;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function buildUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

async function invokeTask(env: Env, path: string): Promise<TaskResult> {
  const started = Date.now();

  try {
    const response = await fetch(buildUrl(env.NOTIFY_BASE_URL, path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NOTIFY_CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const body = await response.text();

    return {
      path,
      ok: response.ok,
      status: response.status,
      body,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      path,
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : 'Unknown worker task error',
      durationMs: Date.now() - started,
    };
  }
}

async function runAllTasks(env: Env): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const started = Date.now();

  const results: TaskResult[] = [];
  for (const path of TASK_PATHS) {
    results.push(await invokeTask(env, path));
  }

  const ok = results.every((result) => result.ok);

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalMs: Date.now() - started,
    ok,
    results,
  };
}

function hasManualAccess(request: Request, env: Env): boolean {
  const expected = env.WORKER_MANUAL_TOKEN?.trim();
  if (!expected) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const manualHeader = request.headers.get('x-worker-token')?.trim() ?? '';

  return secureCompareText(bearer, expected) || secureCompareText(manualHeader, expected);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET') {
      const payload = {
        service: 'notify-scheduler',
        status: 'ok',
        tasks: TASK_PATHS,
      };

      return new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (!hasManualAccess(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await runAllTasks(env);

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAllTasks(env));
  },
};
