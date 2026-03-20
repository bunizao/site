import type { APIContext } from 'astro';

export interface OfficeCompatConfig {
  workerBase: string;
  roomId: string;
  joinKey: string;
}

interface OfficeCompatAgent {
  id: string;
  label: string;
  role?: string;
  summary?: string;
  thought?: string;
  mood?: string;
  presence?: string;
  updatedAt?: string;
  currentTask?: {
    title?: string;
    summary?: string;
    tool?: string;
  };
  queue?: Array<unknown>;
}

interface OfficeCompatSnapshot {
  updatedAt?: string;
  agents?: OfficeCompatAgent[];
  workspace?: {
    whiteboard?: Array<{
      agentId: string;
      label: string;
      summary: string;
      updatedAt: string;
    }>;
  };
}

function readEnv(locals: APIContext['locals'], name: string): string {
  const envSource = ((import.meta as { env?: Record<string, string | undefined> }).env) || {};
  const buildValue = envSource[name];
  if (typeof buildValue === 'string' && buildValue.trim()) {
    return buildValue.trim();
  }

  const runtimeValue =
    locals?.runtime?.env?.[name]
    ?? locals?.env?.[name];
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  return '';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function deterministicAvatar(agentId: string): string {
  const hash = [...agentId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const variant = (hash % 6) + 1;
  return `guest_role_${variant}`;
}

export function normalizeState(input: string | undefined | null): string {
  const state = String(input || '').trim().toLowerCase();
  if (['idle', 'writing', 'researching', 'executing', 'syncing', 'error'].includes(state)) {
    return state;
  }
  if (['working', 'busy', 'write'].includes(state)) return 'writing';
  if (['run', 'running', 'execute', 'exec'].includes(state)) return 'executing';
  if (['research', 'search'].includes(state)) return 'researching';
  if (state === 'sync') return 'syncing';
  return 'idle';
}

export function stateToArea(state: string): 'breakroom' | 'writing' | 'error' {
  if (state === 'error') return 'error';
  if (state === 'idle') return 'breakroom';
  return 'writing';
}

function presenceForState(state: string): 'idle' | 'working' | 'blocked' {
  if (state === 'idle') return 'idle';
  if (state === 'error') return 'blocked';
  return 'working';
}

function pickMainAgent(agents: OfficeCompatAgent[]): OfficeCompatAgent | null {
  if (!agents.length) return null;

  const priorities = [
    (agent: OfficeCompatAgent) => /implementation|engineer|coding|developer/i.test(`${agent.role || ''}`),
    (agent: OfficeCompatAgent) => /code-wizard|star|main/i.test(`${agent.id} ${agent.label}`),
    (agent: OfficeCompatAgent) => /wizard|code/i.test(`${agent.id} ${agent.label} ${agent.role || ''}`),
    (agent: OfficeCompatAgent) => agent.presence === 'working',
    (agent: OfficeCompatAgent) => !!agent.currentTask,
    () => true,
  ];

  for (const predicate of priorities) {
    const match = agents.find(predicate);
    if (match) return match;
  }

  return agents[0] || null;
}

function inferVisualState(agent?: Partial<OfficeCompatAgent> | null): string {
  const source = agent || {};
  const haystack = [
    source.currentTask?.title,
    source.currentTask?.summary,
    source.currentTask?.tool,
    source.summary,
    source.thought,
    source.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (source.presence === 'blocked' || source.mood === 'frustrated') return 'error';
  if (/\b(sync|deploy|push|publish|ship|merge|release)\b/.test(haystack)) return 'syncing';
  if (/\b(research|search|investigate|read|trace|analy[sz]e)\b/.test(haystack)) return 'researching';
  if (/\b(exec|run|build|test|lint|command|terminal|migrate)\b/.test(haystack)) return 'executing';
  if (source.presence === 'working' || source.currentTask || (source.queue || []).length > 0) return 'writing';
  return 'idle';
}

export function getOfficeCompatConfig(context: APIContext): OfficeCompatConfig {
  const queryWorkerBase = context.url.searchParams.get('worker')
    || context.request.headers.get('x-office-worker-base')
    || '';
  const queryRoomId = context.url.searchParams.get('room')
    || context.request.headers.get('x-office-room-id')
    || '';
  const workerBase = trimTrailingSlash(queryWorkerBase || readEnv(context.locals, 'PUBLIC_AGENTS_OFFICE_URL'));
  const roomId = queryRoomId || readEnv(context.locals, 'PUBLIC_AGENTS_OFFICE_ROOM_ID') || 'demo';
  const joinKey = readEnv(context.locals, 'OFFICE_JOIN_KEY');

  return {
    workerBase,
    roomId,
    joinKey,
  };
}

export async function fetchSnapshot(config: OfficeCompatConfig): Promise<OfficeCompatSnapshot> {
  if (!config.workerBase) {
    throw new Error('Missing PUBLIC_AGENTS_OFFICE_URL.');
  }

  const response = await fetch(`${config.workerBase}/api/rooms/${config.roomId}/snapshot`, {
    headers: { 'cache-control': 'no-store' },
  });

  if (!response.ok) {
    throw new Error(`Snapshot request failed with ${response.status}.`);
  }

  return (await response.json()) as OfficeCompatSnapshot;
}

export async function postEvent(config: OfficeCompatConfig, event: Record<string, unknown>): Promise<void> {
  if (!config.workerBase) {
    throw new Error('Missing PUBLIC_AGENTS_OFFICE_URL.');
  }

  const response = await fetch(`${config.workerBase}/api/rooms/${config.roomId}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Event push failed with ${response.status}.`);
  }
}

export async function getStatusResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const snapshot = await fetchSnapshot(config);
    const agents = snapshot.agents || [];
    const mainAgent = pickMainAgent(agents);
    const state = inferVisualState(mainAgent || {});
    const detail =
      mainAgent?.thought
      || mainAgent?.currentTask?.summary
      || mainAgent?.summary
      || mainAgent?.currentTask?.title
      || 'Standing by.';

    return json({
      state,
      detail,
      progress: 0,
      updated_at: snapshot.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    return json({ status: 'error', msg: errorMessage(error, 'Failed to read status.') }, 500);
  }
}

export async function getAgentsResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const snapshot = await fetchSnapshot(config);
    const agents = snapshot.agents || [];
    const mainAgent = pickMainAgent(agents);
    const now = Date.now();

    const payload = agents.map((agent) => {
      const state = inferVisualState(agent);
      const updatedAt = agent.updatedAt || snapshot.updatedAt || new Date().toISOString();
      const ageSeconds = Math.max(0, (now - new Date(updatedAt).getTime()) / 1000);
      const authStatus = ageSeconds > 300 ? 'offline' : 'approved';
      return {
        agentId: agent.id,
        name: agent.label,
        isMain: !!mainAgent && agent.id === mainAgent.id,
        state,
        detail: agent.thought || agent.currentTask?.summary || agent.summary || agent.currentTask?.title || '',
        updated_at: updatedAt,
        area: stateToArea(state),
        source: !!mainAgent && agent.id === mainAgent.id ? 'local' : 'remote-openclaw',
        authStatus,
        authExpiresAt: null,
        lastPushAt: updatedAt,
        avatar: deterministicAvatar(agent.id),
      };
    });

    return json(payload);
  } catch (error) {
    return json({ ok: false, msg: errorMessage(error, 'Failed to read agents.') }, 500);
  }
}

export async function getMemoResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const snapshot = await fetchSnapshot(config);
    const entries = snapshot.workspace?.whiteboard || [];

    if (!entries.length) {
      return json({ success: false, msg: 'No memo available.' });
    }

    return json({
      success: true,
      date: new Date().toISOString().slice(0, 10),
      memo: entries.map((entry) => `${entry.label}: ${entry.summary}`).join('\n\n'),
    });
  } catch (error) {
    return json({ success: false, msg: errorMessage(error, 'Failed to build memo.') }, 500);
  }
}

export async function setStateResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const payload = await context.request.json().catch(() => ({}));
    const state = normalizeState(payload?.state);
    const detail = String(payload?.detail || '').trim();
    const snapshot = await fetchSnapshot(config);
    const mainAgent = pickMainAgent(snapshot.agents || []);

    if (!mainAgent) {
      return json({ status: 'error', msg: 'No main agent found.' }, 404);
    }

    await postEvent(config, {
      type: 'agent.presence.set',
      agentId: mainAgent.id,
      presence: presenceForState(state),
    });
    await postEvent(config, {
      type: 'agent.summary.set',
      agentId: mainAgent.id,
      summary: detail || mainAgent.summary || state,
    });
    await postEvent(config, {
      type: 'agent.thought.set',
      agentId: mainAgent.id,
      thought: detail || null,
      ttl: detail ? 120000 : undefined,
    });

    return json({ status: 'ok' });
  } catch (error) {
    return json({ status: 'error', msg: errorMessage(error, 'Failed to set state.') }, 500);
  }
}

export async function leaveAgentResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const payload = await context.request.json().catch(() => ({}));
    const agentId = String(payload?.agentId || '').trim();
    const name = String(payload?.name || '').trim();

    if (!agentId && !name) {
      return json({ ok: false, msg: 'Missing agentId or name.' }, 400);
    }

    const snapshot = await fetchSnapshot(config);
    const agents = snapshot.agents || [];
    const target = agents.find((agent) => agent.id === agentId) || agents.find((agent) => agent.label === name);
    if (!target) {
      return json({ ok: false, msg: 'Agent not found.' }, 404);
    }

    await postEvent(config, {
      type: 'agent.remove',
      agentId: target.id,
    });

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, msg: errorMessage(error, 'Failed to leave agent.') }, 500);
  }
}

export async function agentApproveResponse(context: APIContext): Promise<Response> {
  try {
    const payload = await context.request.json().catch(() => ({}));
    const agentId = String(payload?.agentId || '').trim();
    if (!agentId) {
      return json({ ok: false, msg: 'Missing agentId.' }, 400);
    }
    return json({ ok: true, agentId, authStatus: 'approved' });
  } catch (error) {
    return json({ ok: false, msg: errorMessage(error, 'Failed to approve agent.') }, 500);
  }
}

export async function agentRejectResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const payload = await context.request.json().catch(() => ({}));
    const agentId = String(payload?.agentId || '').trim();
    if (!agentId) {
      return json({ ok: false, msg: 'Missing agentId.' }, 400);
    }

    await postEvent(config, {
      type: 'agent.remove',
      agentId,
    });

    return json({ ok: true, agentId, authStatus: 'rejected' });
  } catch (error) {
    return json({ ok: false, msg: errorMessage(error, 'Failed to reject agent.') }, 500);
  }
}

export async function joinAgentResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const payload = await context.request.json().catch(() => ({}));
    const name = String(payload?.name || '').trim();
    const joinKey = String(payload?.joinKey || '').trim();
    const state = normalizeState(payload?.state);
    const detail = String(payload?.detail || '').trim();

    if (!name) {
      return json({ ok: false, msg: 'Missing name.' }, 400);
    }

    if (config.joinKey && joinKey !== config.joinKey) {
      return json({ ok: false, msg: 'Invalid join key.' }, 403);
    }

    const snapshot = await fetchSnapshot(config);
    const agents = snapshot.agents || [];
    const existing = agents.find((agent) => agent.label === name && agent.id !== pickMainAgent(agents)?.id);
    const agentId = existing?.id || `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (!existing) {
      await postEvent(config, {
        type: 'agent.register',
        agentId,
        label: name,
        role: 'Visitor',
      });
    }

    await postEvent(config, {
      type: 'agent.presence.set',
      agentId,
      presence: presenceForState(state),
    });
    await postEvent(config, {
      type: 'agent.summary.set',
      agentId,
      summary: detail || name,
    });
    if (detail) {
      await postEvent(config, {
        type: 'agent.thought.set',
        agentId,
        thought: detail,
        ttl: 120000,
      });
    }

    return json({
      ok: true,
      agentId,
      authStatus: 'approved',
      nextStep: 'Approved automatically. Start pushing status.',
    });
  } catch (error) {
    return json({ ok: false, msg: errorMessage(error, 'Failed to join agent.') }, 500);
  }
}

export async function agentPushResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    const payload = await context.request.json().catch(() => ({}));
    const agentId = String(payload?.agentId || '').trim();
    const joinKey = String(payload?.joinKey || '').trim();
    const state = normalizeState(payload?.state);
    const detail = String(payload?.detail || '').trim();
    const name = String(payload?.name || '').trim();

    if (!agentId || !payload?.state) {
      return json({ ok: false, msg: 'Missing agentId/state.' }, 400);
    }

    if (config.joinKey && joinKey !== config.joinKey) {
      return json({ ok: false, msg: 'joinKey mismatch.' }, 403);
    }

    const snapshot = await fetchSnapshot(config);
    const target = (snapshot.agents || []).find((agent) => agent.id === agentId);
    if (!target) {
      return json({ ok: false, msg: 'agent not registered, join first.' }, 404);
    }

    if (name && name !== target.label) {
      await postEvent(config, {
        type: 'agent.upsert',
        agent: {
          ...target,
          id: agentId,
          label: name,
        },
      });
    }

    await postEvent(config, {
      type: 'agent.presence.set',
      agentId,
      presence: presenceForState(state),
    });
    await postEvent(config, {
      type: 'agent.summary.set',
      agentId,
      summary: detail || target.summary || state,
    });
    await postEvent(config, {
      type: 'agent.thought.set',
      agentId,
      thought: detail || null,
      ttl: detail ? 120000 : undefined,
    });

    return json({ ok: true, agentId, area: stateToArea(state) });
  } catch (error) {
    return json({ ok: false, msg: errorMessage(error, 'Failed to push agent state.') }, 500);
  }
}

export async function healthResponse(context: APIContext): Promise<Response> {
  try {
    const config = getOfficeCompatConfig(context);
    return json({
      status: 'ok',
      service: 'office-runtime-compat',
      roomId: config.roomId,
      workerBase: config.workerBase,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json({ status: 'error', msg: errorMessage(error, 'Failed to read health.') }, 500);
  }
}
