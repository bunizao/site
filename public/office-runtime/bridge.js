(function () {
  const params = new URLSearchParams(window.location.search);
  const originalFetch = window.fetch.bind(window);
  const storageKey = 'officeRuntimeConfig';
  const guestOverridesKey = 'officeRuntimeGuestOverrides';
  const mainStateOverridesKey = 'officeRuntimeMainStateOverrides';

  let storedConfig = null;
  try {
    storedConfig = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
  } catch (error) {
    storedConfig = null;
  }

  const workerBase = (params.get('worker') || storedConfig?.workerBase || '').replace(/\/+$/, '');
  const roomId = params.get('room') || storedConfig?.roomId || 'demo';

  let snapshotCache = null;
  let snapshotFetchedAt = 0;
  let inflightSnapshot = null;

  function readJsonStorage(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Ignore storage failures in runtime mode.
    }
  }

  const guestOverrides = readJsonStorage(guestOverridesKey, {});
  const mainStateOverrides = readJsonStorage(mainStateOverridesKey, {});

  function responseJson(data, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    }));
  }

  function normalizeVisualState(agent) {
    const haystack = [
      agent?.currentTask?.title,
      agent?.currentTask?.summary,
      agent?.currentTask?.tool,
      agent?.summary,
      agent?.thought,
      agent?.role,
    ].filter(Boolean).join(' ').toLowerCase();

    if (agent?.presence === 'blocked' || agent?.mood === 'frustrated') return 'error';
    if (/\b(sync|deploy|push|publish|ship|merge|release)\b/.test(haystack)) return 'syncing';
    if (/\b(research|search|investigate|read|trace|analy[sz]e)\b/.test(haystack)) return 'researching';
    if (/\b(exec|run|build|test|lint|command|terminal|migrate)\b/.test(haystack)) return 'executing';
    if (agent?.presence === 'working' || agent?.currentTask || (agent?.queue || []).length > 0) return 'writing';
    return 'idle';
  }

  function stateToArea(state) {
    if (state === 'error') return 'error';
    if (state === 'idle') return 'breakroom';
    return 'writing';
  }

  function pickMainAgent(agents) {
    if (!Array.isArray(agents) || agents.length === 0) return null;

    const priorities = [
      (agent) => /implementation|engineer|coding|developer/i.test(`${agent.role || ''}`),
      (agent) => /code-wizard|star|main/i.test(`${agent.id} ${agent.label}`),
      (agent) => /wizard|code/i.test(`${agent.id} ${agent.label} ${agent.role || ''}`),
      (agent) => agent.presence === 'working',
      (agent) => agent.currentTask,
      () => true,
    ];

    for (const predicate of priorities) {
      const match = agents.find(predicate);
      if (match) return match;
    }

    return agents[0];
  }

  function buildStatus(snapshot) {
    const mainAgent = pickMainAgent(snapshot?.agents || []);
    const overrideState = mainAgent ? mainStateOverrides[mainAgent.id] : null;
    const state = overrideState?.state || normalizeVisualState(mainAgent || {});
    const detail = mainAgent?.thought
      || mainAgent?.currentTask?.summary
      || mainAgent?.summary
      || mainAgent?.currentTask?.title
      || 'Standing by.';

    return {
      state,
      detail,
      progress: 0,
      updated_at: snapshot?.updatedAt || new Date().toISOString(),
    };
  }

  function buildAgents(snapshot) {
    const agents = snapshot?.agents || [];
    const mainAgent = pickMainAgent(agents);

    return agents
      .filter((agent) => !mainAgent || agent.id !== mainAgent.id)
      .filter((agent) => guestOverrides[agent.id]?.hidden !== true)
      .map((agent) => {
        const override = guestOverrides[agent.id] || {};
        const state = override.state || normalizeVisualState(agent);
        return {
          agentId: agent.id,
          name: agent.label || agent.id,
          isMain: false,
          state,
          detail: agent.thought || agent.currentTask?.summary || agent.summary || agent.currentTask?.title || '',
          area: stateToArea(state),
          authStatus: override.authStatus || (agent.presence === 'offline' ? 'offline' : 'approved'),
          updated_at: agent.updatedAt || snapshot?.updatedAt || new Date().toISOString(),
        };
      });
  }

  function buildMemo(snapshot) {
    const entries = snapshot?.workspace?.whiteboard || [];
    if (!entries.length) {
      return {
        success: false,
        memo: '',
        date: '',
      };
    }

    return {
      success: true,
      memo: entries.map((entry) => `${entry.label}: ${entry.summary}`).join('\n\n'),
      date: new Date().toISOString().slice(0, 10),
    };
  }

  async function getSnapshot(force) {
    if (!workerBase) {
      throw new Error('Missing worker base URL.');
    }

    const now = Date.now();
    if (!force && snapshotCache && now - snapshotFetchedAt < 900) {
      return snapshotCache;
    }

    if (inflightSnapshot) {
      return inflightSnapshot;
    }

    inflightSnapshot = originalFetch(`${workerBase}/api/rooms/${roomId}/snapshot`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Snapshot request failed with ${response.status}`);
        }
        const data = await response.json();
        snapshotCache = data;
        snapshotFetchedAt = Date.now();
        return data;
      })
      .finally(() => {
        inflightSnapshot = null;
      });

    return inflightSnapshot;
  }

  async function postEvent(event) {
    if (!workerBase) {
      throw new Error('Missing worker base URL.');
    }

    const response = await originalFetch(`${workerBase}/api/rooms/${roomId}/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Event push failed with ${response.status}`);
    }

    snapshotCache = null;
    snapshotFetchedAt = 0;
    return response;
  }

  async function setMainAgentState(payload) {
    const snapshot = await getSnapshot(true);
    const mainAgent = pickMainAgent(snapshot?.agents || []);
    if (!mainAgent) {
      return { ok: false, msg: 'No main agent available.' };
    }

    const state = String(payload?.state || 'idle');
    const detail = String(payload?.detail || '').trim();

    mainStateOverrides[mainAgent.id] = {
      state,
      detail,
      updatedAt: new Date().toISOString(),
    };
    writeJsonStorage(mainStateOverridesKey, mainStateOverrides);

    const presence =
      state === 'idle' ? 'idle'
      : state === 'error' ? 'blocked'
      : 'working';

    const events = [
      { type: 'agent.presence.set', agentId: mainAgent.id, presence },
      { type: 'agent.summary.set', agentId: mainAgent.id, summary: detail || mainAgent.summary || state },
      { type: 'agent.thought.set', agentId: mainAgent.id, thought: detail || null, ttl: detail ? 120000 : undefined },
    ];

    for (const event of events) {
      await postEvent(event);
    }

    return { ok: true, state, detail };
  }

  async function leaveGuestAgent(payload) {
    const agentId = String(payload?.agentId || '');
    if (!agentId) {
      return { ok: false, msg: 'Missing agentId.' };
    }

    guestOverrides[agentId] = {
      ...(guestOverrides[agentId] || {}),
      hidden: true,
    };
    writeJsonStorage(guestOverridesKey, guestOverrides);

    await postEvent({ type: 'agent.remove', agentId });
    return { ok: true };
  }

  async function updateGuestAuth(agentId, authStatus) {
    if (!agentId) {
      return { ok: false, msg: 'Missing agentId.' };
    }

    guestOverrides[agentId] = {
      ...(guestOverrides[agentId] || {}),
      authStatus,
      hidden: false,
    };
    writeJsonStorage(guestOverridesKey, guestOverrides);

    return { ok: true, authStatus };
  }

  function unsupportedOk(extra) {
    return { ok: true, ...extra };
  }

  window.__STAR_OFFICE_RUNTIME__ = { workerBase, roomId };

  window.fetch = async function patchedFetch(input, init) {
    const requestUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(requestUrl, window.location.href);
    const pathname = url.pathname;
    const method = (init?.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();

    if (pathname === '/status') {
      return responseJson(buildStatus(await getSnapshot(false)));
    }

    if (pathname === '/agents') {
      return responseJson(buildAgents(await getSnapshot(false)));
    }

    if (pathname === '/yesterday-memo') {
      return responseJson(buildMemo(await getSnapshot(false)));
    }

    if (pathname === '/health') {
      return responseJson({ ok: true, roomId, workerBase });
    }

    if (pathname === '/set_state' && method === 'POST') {
      const payload = JSON.parse(init?.body || '{}');
      return responseJson(await setMainAgentState(payload));
    }

    if (pathname === '/leave-agent' && method === 'POST') {
      const payload = JSON.parse(init?.body || '{}');
      return responseJson(await leaveGuestAgent(payload));
    }

    if (pathname === '/agent-approve' && method === 'POST') {
      const payload = JSON.parse(init?.body || '{}');
      return responseJson(await updateGuestAuth(String(payload?.agentId || ''), 'approved'));
    }

    if (pathname === '/agent-reject' && method === 'POST') {
      const payload = JSON.parse(init?.body || '{}');
      return responseJson(await updateGuestAuth(String(payload?.agentId || ''), 'rejected'));
    }

    if (pathname === '/assets/auth/status') {
      return responseJson(unsupportedOk({ authed: false }));
    }

    if (pathname === '/config/gemini') {
      if (method === 'GET') {
        return responseJson(unsupportedOk({ hasKey: false, maskedKey: '' }));
      }
      return responseJson(unsupportedOk({ saved: false, unsupported: true }));
    }

    if (pathname === '/assets/list') {
      return responseJson(unsupportedOk({ items: [] }));
    }

    if (pathname === '/assets/positions' || pathname === '/assets/defaults') {
      return responseJson(unsupportedOk({ items: {} }));
    }

    if (
      pathname.startsWith('/assets/home-favorites/')
      || pathname.startsWith('/assets/generate-rpg-background')
      || pathname.startsWith('/assets/restore-')
      || pathname === '/assets/upload'
      || pathname === '/assets/auth'
    ) {
      return responseJson({ ok: false, unsupported: true, msg: 'Unsupported in worker-backed office runtime.' }, 200);
    }

    return originalFetch(input, init);
  };
})();
