import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  agentApproveResponse,
  agentPushResponse,
  getAgentsResponse,
  joinAgentResponse,
  leaveAgentResponse,
} from '@/lib/office-compat';
import { resetOfficeGuestAuthState } from '@/lib/office-guest-auth-store';

interface MockAgent {
  id: string;
  label: string;
  role?: string;
  summary: string;
  presence: string;
  updatedAt: string;
  queue: unknown[];
  preferences?: {
    preferredZoneId?: string;
  };
  appearance?: {
    spriteVariant?: string;
  };
}

interface MockSnapshot {
  updatedAt: string;
  agents: MockAgent[];
  workspace: {
    whiteboard: Array<{
      agentId: string;
      label: string;
      summary: string;
      updatedAt: string;
    }>;
  };
}

function createContext(path: string, method: string, body?: unknown, env: Record<string, string> = {}) {
  const url = new URL(`http://example.test${path}`);
  const request = new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-office-worker-base': 'https://worker.example.com',
      'x-office-room-id': 'demo',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return { request, url, locals: { env } } as any;
}

describe('office compat guest flow', () => {
  let snapshot: MockSnapshot;
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    resetOfficeGuestAuthState();
    snapshot = {
      updatedAt: new Date().toISOString(),
      agents: [
        {
          id: 'code-wizard',
          label: 'Code-Wizard',
          role: 'Implementation',
          summary: 'Main agent.',
          presence: 'working',
          updatedAt: new Date().toISOString(),
          queue: [],
        },
      ],
      workspace: {
        whiteboard: [],
      },
    };

    fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(rawUrl);

      if (url.pathname.endsWith('/snapshot')) {
        return new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.pathname.endsWith('/events')) {
        const payload = JSON.parse(String(init?.body || '{}'));
        switch (payload.type) {
          case 'agent.register':
            snapshot.agents.push({
              id: payload.agentId,
              label: payload.label,
              role: payload.role,
              summary: '',
              presence: 'idle',
              updatedAt: new Date().toISOString(),
              queue: [],
              appearance: payload.appearance,
              preferences: payload.preferences,
            });
            break;
          case 'agent.presence.set': {
            const agent = snapshot.agents.find((entry) => entry.id === payload.agentId);
            if (agent) {
              agent.presence = payload.presence;
              agent.updatedAt = new Date().toISOString();
            }
            break;
          }
          case 'agent.summary.set': {
            const agent = snapshot.agents.find((entry) => entry.id === payload.agentId);
            if (agent) {
              agent.summary = payload.summary;
              agent.updatedAt = new Date().toISOString();
            }
            break;
          }
          case 'agent.thought.set': {
            const agent = snapshot.agents.find((entry) => entry.id === payload.agentId);
            if (agent) {
              agent.updatedAt = new Date().toISOString();
            }
            break;
          }
          case 'agent.upsert': {
            const index = snapshot.agents.findIndex((entry) => entry.id === payload.agent.id);
            if (index >= 0) {
              snapshot.agents[index] = {
                ...snapshot.agents[index],
                ...payload.agent,
                updatedAt: new Date().toISOString(),
              };
            }
            break;
          }
          case 'agent.remove':
            snapshot.agents = snapshot.agents.filter((entry) => entry.id !== payload.agentId);
            break;
          default:
            break;
        }

        snapshot.updatedAt = new Date().toISOString();
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404 });
    });

    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    mock.restore();
  });

  test('supports join, push, list, and leave', async () => {
    const joinResponse = await joinAgentResponse(createContext('/join-agent', 'POST', {
      name: 'Compat Guest',
      joinKey: '',
      state: 'idle',
      detail: 'compat join',
    }));
    const joinData = await joinResponse.json() as { ok: boolean; agentId: string; authStatus: string };

    expect(joinData.ok).toBe(true);
    expect(typeof joinData.agentId).toBe('string');
    expect(joinData.authStatus).toBe('pending');

    const pendingPush = await agentPushResponse(createContext('/agent-push', 'POST', {
      agentId: joinData.agentId,
      joinKey: '',
      state: 'writing',
      detail: 'editing implementation task',
      name: 'Compat Guest',
    }));
    expect(pendingPush.status).toBe(403);

    const approveResponse = await agentApproveResponse(createContext('/agent-approve', 'POST', {
      agentId: joinData.agentId,
    }));
    const approveData = await approveResponse.json() as { ok: boolean; authStatus: string };
    expect(approveData.ok).toBe(true);
    expect(approveData.authStatus).toBe('approved');

    const pushResponse = await agentPushResponse(createContext('/agent-push', 'POST', {
      agentId: joinData.agentId,
      joinKey: '',
      state: 'writing',
      detail: 'editing implementation task',
      name: 'Compat Guest',
    }));
    const pushData = await pushResponse.json() as { ok: boolean; area: string };

    expect(pushData.ok).toBe(true);
    expect(pushData.area).toBe('writing');

    const agentsResponse = await getAgentsResponse(createContext('/agents', 'GET'));
    const agentsData = await agentsResponse.json() as Array<{ agentId: string; state: string; authStatus: string }>;
    const guest = agentsData.find((agent) => agent.agentId === joinData.agentId);

    expect(guest).toBeDefined();
    expect(guest?.state).toBe('writing');
    expect(guest?.authStatus).toBe('approved');

    const leaveResponse = await leaveAgentResponse(createContext('/leave-agent', 'POST', {
      agentId: joinData.agentId,
    }));
    const leaveData = await leaveResponse.json() as { ok: boolean };

    expect(leaveData.ok).toBe(true);

    const agentsAfterLeave = await (await getAgentsResponse(createContext('/agents', 'GET'))).json() as Array<{ agentId: string }>;
    expect(agentsAfterLeave.some((agent) => agent.agentId === joinData.agentId)).toBe(false);
  });

  test('rejects invalid join key when configured', async () => {
    const response = await joinAgentResponse(createContext(
      '/join-agent',
      'POST',
      {
        name: 'Wrong Key Guest',
        joinKey: 'bad-key',
        state: 'idle',
      },
      {
        OFFICE_JOIN_KEYS: 'alpha-key,beta-key',
      },
    ));
    const data = await response.json() as { ok: boolean; msg: string };

    expect(response.status).toBe(403);
    expect(data.ok).toBe(false);
  });

  test('enforces join key concurrency limit', async () => {
    const now = new Date().toISOString();
    snapshot.agents.push(
      {
        id: 'guest-a',
        label: 'Guest A',
        role: 'Visitor',
        summary: '',
        presence: 'working',
        updatedAt: now,
        queue: [],
        preferences: { preferredZoneId: 'alpha-key' },
      },
      {
        id: 'guest-b',
        label: 'Guest B',
        role: 'Visitor',
        summary: '',
        presence: 'working',
        updatedAt: now,
        queue: [],
        preferences: { preferredZoneId: 'alpha-key' },
      },
    );

    const response = await joinAgentResponse(createContext(
      '/join-agent',
      'POST',
      {
        name: 'Guest C',
        joinKey: 'alpha-key',
        state: 'idle',
      },
      {
        OFFICE_JOIN_KEYS: 'alpha-key',
        OFFICE_JOIN_MAX_CONCURRENT: '2',
      },
    ));
    const data = await response.json() as { ok: boolean; msg: string };

    expect(response.status).toBe(429);
    expect(data.ok).toBe(false);
  });

  test('marks approved guest offline after push timeout', async () => {
    const joinResponse = await joinAgentResponse(createContext('/join-agent', 'POST', {
      name: 'Offline Guest',
      joinKey: '',
      state: 'idle',
    }, {
      OFFICE_JOIN_OFFLINE_AFTER_MS: '1000',
      OFFICE_JOIN_APPROVED_TTL_MS: '120000',
    }));
    const joinData = await joinResponse.json() as { agentId: string };

    await agentApproveResponse(createContext('/agent-approve', 'POST', {
      agentId: joinData.agentId,
    }, {
      OFFICE_JOIN_OFFLINE_AFTER_MS: '1000',
      OFFICE_JOIN_APPROVED_TTL_MS: '120000',
    }));

    await agentPushResponse(createContext('/agent-push', 'POST', {
      agentId: joinData.agentId,
      joinKey: '',
      state: 'idle',
      name: 'Offline Guest',
    }, {
      OFFICE_JOIN_OFFLINE_AFTER_MS: '1000',
      OFFICE_JOIN_APPROVED_TTL_MS: '120000',
    }));

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const agentsResponse = await getAgentsResponse(createContext('/agents', 'GET', undefined, {
      OFFICE_JOIN_OFFLINE_AFTER_MS: '1000',
      OFFICE_JOIN_APPROVED_TTL_MS: '120000',
    }));
    const agentsData = await agentsResponse.json() as Array<{ agentId: string; authStatus: string }>;
    const guest = agentsData.find((agent) => agent.agentId === joinData.agentId);

    expect(guest?.authStatus).toBe('offline');
  });
});
