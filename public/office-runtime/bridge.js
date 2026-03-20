(function () {
  const params = new URLSearchParams(window.location.search);
  const originalFetch = window.fetch.bind(window);
  const storageKey = 'officeRuntimeConfig';
  const guestOverridesKey = 'officeRuntimeGuestOverrides';
  const mainStateOverridesKey = 'officeRuntimeMainStateOverrides';
  const assetAuthKey = 'officeRuntimeAssetAuth';
  const geminiConfigKey = 'officeRuntimeGeminiConfig';
  const assetPositionsKey = 'officeRuntimeAssetPositions';
  const assetDefaultsKey = 'officeRuntimeAssetDefaults';
  const homeFavoritesKey = 'officeRuntimeHomeFavorites';

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
  let assetDrawerAuthed = !!readJsonStorage(assetAuthKey, false);
  let geminiConfig = readJsonStorage(geminiConfigKey, { apiKey: '', model: 'nanobanana-pro' });
  let assetPositions = readJsonStorage(assetPositionsKey, {});
  let assetDefaults = readJsonStorage(assetDefaultsKey, {});
  let homeFavorites = readJsonStorage(homeFavoritesKey, []);

  const STATIC_ASSET_ITEMS = [
    ['btn-back-home-sprite.png', 480, 160],
    ['btn-broker-sprite.png', 480, 160],
    ['btn-diy-sprite.png', 480, 160],
    ['btn-move-house-sprite.png', 480, 160],
    ['btn-open-drawer-sprite.png', 720, 160],
    ['btn-state-sprite.png', 480, 160],
    ['cats-spritesheet.webp', 1600, 160],
    ['coffee-machine-shadow-v1.png', 230, 230],
    ['coffee-machine-v3-grid.webp', 2760, 1840],
    ['desk-v3.webp', 276, 214],
    ['error-bug-spritesheet-grid.webp', 1760, 1980],
    ['flowers-bloom-v2.webp', 1040, 1040],
    ['guest_anim_1.webp', 128, 64],
    ['guest_anim_2.webp', 128, 64],
    ['guest_anim_3.webp', 128, 64],
    ['guest_anim_4.webp', 128, 64],
    ['guest_anim_5.webp', 128, 64],
    ['guest_anim_6.webp', 128, 64],
    ['guest_role_1.png', 32, 32],
    ['guest_role_2.png', 32, 32],
    ['guest_role_3.png', 32, 32],
    ['guest_role_4.png', 32, 32],
    ['guest_role_5.png', 32, 32],
    ['guest_role_6.png', 32, 32],
    ['memo-bg.webp', 400, 300],
    ['office_bg.webp', 1280, 720],
    ['office_bg_small.webp', 1280, 720],
    ['plants-spritesheet.webp', 480, 160],
    ['posters-spritesheet.webp', 5120, 160],
    ['serverroom-spritesheet.webp', 7200, 251],
    ['sofa-idle-v3.png', 256, 256],
    ['sofa-shadow-v1.png', 256, 256],
    ['star-idle-v5.png', 2048, 1536],
    ['star-working-spritesheet-grid.webp', 2400, 1500],
    ['sync-animation-v3-grid.webp', 2048, 1792],
  ].map(([path, width, height]) => ({
    path,
    width,
    height,
    ext: `.${String(path).split('.').pop()}`,
    size: 0,
    mtime: '',
  }));

  function responseJson(data, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    }));
  }

  function requireAssetAuth() {
    if (assetDrawerAuthed) return null;
    return { ok: false, code: 'UNAUTHORIZED', msg: 'Asset editor auth required' };
  }

  function maskKey(value) {
    if (!value) return '';
    if (value.length <= 8) return `${value.slice(0, 2)}***`;
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
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
      return responseJson(unsupportedOk({ authed: assetDrawerAuthed, drawer_default_pass: true }));
    }

    if (pathname === '/assets/auth' && method === 'POST') {
      const payload = JSON.parse(init?.body || '{}');
      const password = String(payload?.password || '').trim();
      if (password === '1234') {
        assetDrawerAuthed = true;
        writeJsonStorage(assetAuthKey, true);
        return responseJson({ ok: true, msg: '认证成功' });
      }
      return responseJson({ ok: false, msg: '验证码错误' }, 401);
    }

    if (pathname === '/config/gemini') {
      if (method === 'GET') {
        const guard = requireAssetAuth();
        if (guard) return responseJson(guard, 401);
        return responseJson({
          ok: true,
          has_api_key: !!geminiConfig.apiKey,
          api_key_masked: maskKey(geminiConfig.apiKey),
          gemini_model: geminiConfig.model || 'nanobanana-pro',
        });
      }
      const guard = requireAssetAuth();
      if (guard) return responseJson(guard, 401);
      const payload = JSON.parse(init?.body || '{}');
      geminiConfig = {
        apiKey: String(payload?.api_key || '').trim(),
        model: String(payload?.model || 'nanobanana-pro').trim() || 'nanobanana-pro',
      };
      writeJsonStorage(geminiConfigKey, geminiConfig);
      return responseJson({ ok: true, api_key_masked: maskKey(geminiConfig.apiKey), gemini_model: geminiConfig.model });
    }

    if (pathname === '/assets/list') {
      return responseJson({ ok: true, count: STATIC_ASSET_ITEMS.length, items: STATIC_ASSET_ITEMS });
    }

    if (pathname === '/assets/positions') {
      const guard = requireAssetAuth();
      if (guard) return responseJson(guard, 401);
      if (method === 'GET') {
        return responseJson({ ok: true, items: assetPositions });
      }
      const payload = JSON.parse(init?.body || '{}');
      const key = String(payload?.key || '').trim();
      if (!key) return responseJson({ ok: false, msg: '缺少 key' }, 400);
      assetPositions[key] = {
        x: Number(payload?.x || 0),
        y: Number(payload?.y || 0),
        scale: Number(payload?.scale || 1),
        updated_at: new Date().toISOString(),
      };
      writeJsonStorage(assetPositionsKey, assetPositions);
      return responseJson({ ok: true, key, ...assetPositions[key] });
    }

    if (pathname === '/assets/defaults') {
      const guard = requireAssetAuth();
      if (guard) return responseJson(guard, 401);
      if (method === 'GET') {
        return responseJson({ ok: true, items: assetDefaults });
      }
      const payload = JSON.parse(init?.body || '{}');
      const key = String(payload?.key || '').trim();
      if (!key) return responseJson({ ok: false, msg: '缺少 key' }, 400);
      assetDefaults[key] = {
        x: Number(payload?.x || 0),
        y: Number(payload?.y || 0),
        scale: Number(payload?.scale || 1),
        updated_at: new Date().toISOString(),
      };
      writeJsonStorage(assetDefaultsKey, assetDefaults);
      return responseJson({ ok: true, key, ...assetDefaults[key] });
    }

    if (pathname === '/assets/home-favorites/list') {
      const guard = requireAssetAuth();
      if (guard) return responseJson(guard, 401);
      return responseJson({ ok: true, items: homeFavorites });
    }

    if (pathname === '/assets/home-favorites/save-current' && method === 'POST') {
      const guard = requireAssetAuth();
      if (guard) return responseJson(guard, 401);
      const item = {
        id: `home-${Date.now()}`,
        path: 'office_bg_small.webp',
        url: '/office-runtime/static/office_bg_small.webp',
        thumb_url: '/office-runtime/static/office_bg_small.webp',
        created_at: new Date().toISOString(),
      };
      homeFavorites = [item, ...homeFavorites].slice(0, 30);
      writeJsonStorage(homeFavoritesKey, homeFavorites);
      return responseJson({ ok: true, id: item.id, path: item.path, msg: '已收藏当前地图' });
    }

    if (pathname === '/assets/home-favorites/apply' && method === 'POST') {
      const guard = requireAssetAuth();
      if (guard) return responseJson(guard, 401);
      const payload = JSON.parse(init?.body || '{}');
      const id = String(payload?.id || '').trim();
      const hit = homeFavorites.find((item) => item.id === id);
      if (!hit) return responseJson({ ok: false, msg: '收藏项不存在' }, 404);
      return responseJson({ ok: true, path: 'office_bg_small.webp', from: hit.path, msg: '已应用收藏地图' });
    }

    if (pathname === '/assets/home-favorites/delete' && method === 'POST') {
      const guard = requireAssetAuth();
      if (guard) return responseJson(guard, 401);
      const payload = JSON.parse(init?.body || '{}');
      const id = String(payload?.id || '').trim();
      homeFavorites = homeFavorites.filter((item) => item.id !== id);
      writeJsonStorage(homeFavoritesKey, homeFavorites);
      return responseJson({ ok: true, id, msg: '已删除收藏' });
    }

    if (
      pathname.startsWith('/assets/generate-rpg-background')
      || pathname.startsWith('/assets/restore-')
      || pathname === '/assets/upload'
    ) {
      return responseJson({ ok: false, unsupported: true, msg: 'Unsupported in worker-backed office runtime.' }, 200);
    }

    return originalFetch(input, init);
  };
})();
