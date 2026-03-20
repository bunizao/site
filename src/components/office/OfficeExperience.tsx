import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import './office.css';

type PresenceState = 'idle' | 'working' | 'walking' | 'blocked' | 'offline';
type VisualState = 'idle' | 'writing' | 'researching' | 'executing' | 'syncing' | 'error';

interface OfficeSnapshot {
  roomId: string;
  updatedAt: string;
  workspace: {
    title: string;
    whiteboard: WhiteboardEntry[];
  };
  agents: OfficeAgent[];
  environment: {
    weather: {
      condition: string;
      temperature: number;
      region: string;
    };
    lighting: {
      timeOfDay: string;
    };
    music: {
      playing: boolean;
      genre?: string;
    };
  };
}

interface WhiteboardEntry {
  agentId: string;
  label: string;
  summary: string;
  updatedAt: string;
}

interface OfficeTask {
  title: string;
  summary?: string;
  tool?: string;
}

interface OfficeAgent {
  id: string;
  label: string;
  role?: string;
  summary: string;
  presence: PresenceState;
  mood?: string;
  thought?: string;
  currentTask?: OfficeTask;
  queue: { id: string; title: string }[];
}

interface AgentCardModel {
  id: string;
  label: string;
  role: string;
  visualState: VisualState;
  sceneArea: 'breakroom' | 'writing' | 'error';
  areaSlot: number;
  bubble: string;
  slot: number;
  primary: boolean;
  summary: string;
  queueCount: number;
  task?: OfficeTask;
}

interface Props {
  defaultWorkerBase: string;
  defaultRoomId: string;
}

const WEATHER_ICON: Record<string, string> = {
  clear: 'sun / clear',
  cloudy: 'cloud / low contrast',
  rain: 'rain / static on glass',
  storm: 'storm / alert mode',
  snow: 'snow / cold air',
  fog: 'fog / muted view',
  windy: 'wind / draft',
};

const AREA_POSITIONS: Record<'breakroom' | 'writing' | 'error', Array<{ left: number; top: number }>> = {
  breakroom: [
    { left: 48.4375, top: 25.0 },
    { left: 43.75, top: 30.5556 },
    { left: 53.125, top: 29.1667 },
    { left: 42.1875, top: 23.6111 },
    { left: 54.6875, top: 33.3333 },
    { left: 46.875, top: 34.7222 },
    { left: 50.7813, top: 22.2222 },
    { left: 45.3125, top: 27.7778 },
  ],
  writing: [
    { left: 59.375, top: 44.4444 },
    { left: 64.8438, top: 38.8889 },
    { left: 53.9063, top: 48.6111 },
    { left: 60.1563, top: 36.1111 },
    { left: 66.4063, top: 47.2222 },
    { left: 56.25, top: 41.6667 },
    { left: 62.5, top: 51.3889 },
    { left: 58.5938, top: 33.3333 },
  ],
  error: [
    { left: 14.0625, top: 36.1111 },
    { left: 9.375, top: 30.5556 },
    { left: 18.75, top: 31.9444 },
    { left: 12.5, top: 27.7778 },
    { left: 17.1875, top: 37.5 },
    { left: 10.9375, top: 34.7222 },
    { left: 15.625, top: 29.1667 },
    { left: 20.3125, top: 36.1111 },
  ],
};

const FALLBACK_BUBBLES: Record<VisualState, string[]> = {
  idle: [
    'Standing by.',
    'Quiet room, warm coffee.',
    'Listening for the next task.',
  ],
  writing: [
    'Drafting the next move.',
    'Keeping the flow clean.',
    'Working the main path.',
  ],
  researching: [
    'Checking the evidence chain.',
    'Pulling signal out of noise.',
    'Finding the missing fact.',
  ],
  executing: [
    'Running the sequence.',
    'Pushing the command path.',
    'Making the machine answer.',
  ],
  syncing: [
    'Aligning the room state.',
    'Writing this one upstream.',
    'Locking the latest changes.',
  ],
  error: [
    'Tracing the fault line.',
    'Containing the blast radius.',
    'Turning logs into a fix.',
  ],
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readRuntimeConfig(defaultWorkerBase: string, defaultRoomId: string): {
  workerBase: string;
  roomId: string;
} {
  if (typeof window === 'undefined') {
    return {
      workerBase: trimTrailingSlash(defaultWorkerBase),
      roomId: defaultRoomId,
    };
  }

  const url = new URL(window.location.href);
  return {
    workerBase: trimTrailingSlash(url.searchParams.get('worker') || defaultWorkerBase),
    roomId: url.searchParams.get('room') || defaultRoomId,
  };
}

function inferVisualState(agent: OfficeAgent): VisualState {
  const haystack = [
    agent.currentTask?.title,
    agent.currentTask?.summary,
    agent.currentTask?.tool,
    agent.summary,
    agent.thought,
    agent.role,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (agent.presence === 'blocked' || agent.mood === 'frustrated') {
    return 'error';
  }
  if (/\b(sync|deploy|push|publish|ship|merge|release)\b/.test(haystack)) {
    return 'syncing';
  }
  if (/\b(research|search|investigate|read|trace|analy[sz]e)\b/.test(haystack)) {
    return 'researching';
  }
  if (/\b(exec|run|build|test|lint|command|terminal|migrate)\b/.test(haystack)) {
    return 'executing';
  }
  if (agent.presence === 'working' || agent.currentTask || agent.queue.length > 0) {
    return 'writing';
  }
  return 'idle';
}

function resolveSceneArea(state: VisualState): 'breakroom' | 'writing' | 'error' {
  if (state === 'error') return 'error';
  if (state === 'idle') return 'breakroom';
  return 'writing';
}

function pickBubble(agent: OfficeAgent, state: VisualState): string {
  const candidate = agent.thought || agent.currentTask?.summary || agent.summary || agent.currentTask?.title;
  if (candidate && candidate.trim()) {
    return candidate.trim();
  }

  const options = FALLBACK_BUBBLES[state];
  const hash = [...agent.id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return options[hash % options.length] || options[0];
}

function formatRelativeTime(value: string, now = Date.now()): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diff = now - then;
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function buildAgentModels(snapshot: OfficeSnapshot): AgentCardModel[] {
  const areaCounts: Record<'breakroom' | 'writing' | 'error', number> = {
    breakroom: 0,
    writing: 0,
    error: 0,
  };

  return snapshot.agents.map((agent, index) => {
    const visualState = inferVisualState(agent);
    const sceneArea = resolveSceneArea(visualState);
    const areaSlot = areaCounts[sceneArea];
    areaCounts[sceneArea] += 1;

    return {
      id: agent.id,
      label: agent.label,
      role: agent.role || 'Agent',
      visualState,
      sceneArea,
      areaSlot,
      bubble: pickBubble(agent, visualState),
      slot: index,
      primary: index === 0,
      summary: agent.summary,
      queueCount: agent.queue.length,
      task: agent.currentTask,
    };
  });
}

function getAreaPosition(area: 'breakroom' | 'writing' | 'error', slot: number): { left: number; top: number } {
  const positions = AREA_POSITIONS[area];
  return positions[slot % positions.length] || positions[0];
}

function getBubbleShift(area: 'breakroom' | 'writing' | 'error', slot: number): number {
  const patterns: Record<'breakroom' | 'writing' | 'error', number[]> = {
    breakroom: [0, -34, 34, -56, 56, -22, 22, 0],
    writing: [0, -42, 42, -64, 64, -28, 28, 0],
    error: [0, -30, 30, -48, 48, -18, 18, 0],
  };
  const offsets = patterns[area];
  return offsets[slot % offsets.length] || 0;
}

function getBubbleLift(area: 'breakroom' | 'writing' | 'error', slot: number): number {
  const patterns: Record<'breakroom' | 'writing' | 'error', number[]> = {
    breakroom: [-76, -116, -92, -132, -102, -146, -112, -124],
    writing: [-86, -136, -98, -156, -118, -142, -108, -128],
    error: [-74, -110, -88, -126, -96, -118, -102, -120],
  };
  const lifts = patterns[area];
  return lifts[slot % lifts.length] || -96;
}

function spritePath(agent: AgentCardModel): string {
  if (agent.primary) {
    return agent.visualState === 'idle'
      ? '/office-assets/sprites/star-idle-v5.png'
      : '/office-assets/sprites/star-working-spritesheet-grid.webp';
  }

  const variant = (agent.slot % 6) + 1;
  return `/office-assets/sprites/guest_anim_${variant}.webp`;
}

function spriteClass(agent: AgentCardModel): string {
  if (agent.primary) {
    return agent.visualState === 'idle' ? 'office-agent__sprite--star-idle' : 'office-agent__sprite--star-working';
  }

  return 'office-agent__sprite--guest';
}

export default function OfficeExperience({ defaultWorkerBase, defaultRoomId }: Props) {
  const [{ roomId, workerBase }, setRuntimeConfig] = useState(() =>
    readRuntimeConfig(defaultWorkerBase, defaultRoomId),
  );
  const [snapshot, setSnapshot] = useState<OfficeSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const snapshotRef = useRef<OfficeSnapshot | null>(null);

  const applySnapshot = useEffectEvent((nextSnapshot: OfficeSnapshot) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
      setError(null);
    });
  });

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    setRuntimeConfig(readRuntimeConfig(defaultWorkerBase, defaultRoomId));
  }, [defaultRoomId, defaultWorkerBase]);

  useEffect(() => {
    if (!workerBase) {
      setError('Missing worker base URL. Add ?worker=... or set PUBLIC_AGENTS_OFFICE_URL.');
      return;
    }

    let disposed = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchSnapshot = async () => {
      try {
        const response = await fetch(`${workerBase}/api/rooms/${roomId}/snapshot`);
        if (!response.ok) {
          throw new Error(`Snapshot request failed with ${response.status}.`);
        }
        const data = (await response.json()) as OfficeSnapshot;
        if (!disposed) {
          setConnected(true);
          applySnapshot(data);
        }
      } catch (fetchError) {
        if (!disposed) {
          if (!snapshotRef.current) {
            setError(fetchError instanceof Error ? fetchError.message : 'Failed to load office snapshot.');
          }
        }
      }
    };

    const connect = () => {
      if (disposed) return;

      eventSource = new EventSource(`${workerBase}/api/rooms/${roomId}/stream`);
      eventSource.addEventListener('ready', () => {
        if (!disposed) {
          setConnected(true);
        }
      });
      eventSource.addEventListener('snapshot', (event) => {
        if (disposed) return;
        setConnected(true);
        const data = JSON.parse((event as MessageEvent<string>).data) as OfficeSnapshot;
        applySnapshot(data);
      });
      eventSource.onerror = () => {
        setConnected(false);
        eventSource?.close();
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    void fetchSnapshot();
    connect();

    return () => {
      disposed = true;
      setConnected(false);
      eventSource?.close();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [applySnapshot, roomId, workerBase]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const agentModels = useMemo(() => (snapshot ? buildAgentModels(snapshot) : []), [snapshot]);
  const primaryAgent = agentModels.find((agent) => agent.primary) || null;
  const guestAgents = agentModels.filter((agent) => !agent.primary);

  const whiteboard = snapshot?.workspace.whiteboard.slice(0, 4) || [];
  const condition = snapshot?.environment.weather.condition || 'clear';
  const weatherLabel = WEATHER_ICON[condition] || condition;
  const roomTitle = snapshot?.workspace.title || roomId;
  const queueCount = snapshot?.agents.reduce((total, agent) => total + agent.queue.length, 0) || 0;
  const busyCount = snapshot?.agents.filter((agent) => agent.presence === 'working' || agent.presence === 'blocked').length || 0;
  const musicLabel = snapshot?.environment.music.playing
    ? snapshot.environment.music.genre || 'on'
    : 'off';
  const connectionLabel = connected
    ? 'live stream'
    : snapshot
      ? 'snapshot cached'
      : workerBase
        ? 'connecting'
        : 'worker missing';
  const connectionTone = connected
    ? 'is-online'
    : snapshot
      ? 'is-idle'
      : 'is-offline';

  return (
    <section className="office-shell">
      <div className="office-shell__noise" aria-hidden="true" />

      <header className="office-topbar">
        <div className="office-topbar__left">
          <a className="office-backlink" href="/">
            buxx.me
          </a>
          <div className="office-topbar__meta">
            <p className="office-kicker">/office</p>
            <h1>{roomTitle}</h1>
          </div>
        </div>

        <div className="office-topbar__right">
          <div className="office-status-chip">
            <span className={`office-status-chip__dot ${connectionTone}`} />
            {connectionLabel}
          </div>
          <div className="office-status-chip office-status-chip--subtle">
            {snapshot ? formatRelativeTime(snapshot.updatedAt, now) : 'waiting'}
          </div>
        </div>
      </header>

      <div className="office-grid">
        <div className="office-stage-column">
          <div className="office-stage">
            <div
              className={`office-stage__frame office-stage__frame--${condition} office-stage__frame--${snapshot?.environment.lighting.timeOfDay || 'morning'}`}
            >
            <div className="office-stage__hud">
              <div>
                <p className="office-hud__label">Weather</p>
                <p className="office-hud__value">
                  {weatherLabel}
                  {snapshot ? ` / ${snapshot.environment.weather.temperature}C` : ''}
                </p>
              </div>
              <div>
                <p className="office-hud__label">Region</p>
                <p className="office-hud__value">{snapshot?.environment.weather.region || 'waiting for worker'}</p>
              </div>
              <div>
                <p className="office-hud__label">Mode</p>
                <p className="office-hud__value">{snapshot?.environment.lighting.timeOfDay || 'standby'}</p>
              </div>
            </div>

            <div className="office-scene" role="img" aria-label="Pixel office with live agent activity">
              <div className="office-scene__backdrop" />
              <div className={`office-scene__weather office-scene__weather--${condition}`} />
              <div className="office-zone office-zone--error">bug corner</div>
              <div className="office-zone office-zone--idle">breakroom</div>
              <div className="office-zone office-zone--writing">build floor</div>
              <div className="office-zone office-zone--syncing">sync dock</div>
              <div className="office-prop office-prop--poster" />
              <div className="office-prop office-prop--plant-left" />
              <div className="office-prop office-prop--plant-right" />
              <div className="office-prop office-prop--server" />
              <div className="office-prop office-prop--coffee" />
              <div className="office-prop office-prop--sofa-shadow" />
              <div className="office-prop office-prop--sofa" />
              <div className="office-prop office-prop--desk" />

              {primaryAgent ? (
                (() => {
                  const position = getAreaPosition(primaryAgent.sceneArea, primaryAgent.areaSlot);
                  const bubbleShift = getBubbleShift(primaryAgent.sceneArea, primaryAgent.areaSlot);

                  return (
                    <div
                      className={`office-agent office-agent--primary office-agent--${primaryAgent.visualState}`}
                      style={{
                        left: `${position.left}%`,
                        top: `${position.top}%`,
                        ['--bubble-shift-x' as string]: `${bubbleShift}px`,
                        ['--bubble-shift-y' as string]: `${getBubbleLift(primaryAgent.sceneArea, primaryAgent.areaSlot)}px`,
                      }}
                    >
                      <div className="office-agent__bubble">{primaryAgent.bubble}</div>
                      <div
                        className={`office-agent__sprite ${spriteClass(primaryAgent)}`}
                        style={{ backgroundImage: `url(${spritePath(primaryAgent)})` }}
                        aria-hidden="true"
                      />
                      <div className="office-agent__tag">
                        <strong>{primaryAgent.label}</strong>
                        <span>{primaryAgent.role}</span>
                      </div>
                    </div>
                  );
                })()
              ) : null}

              {guestAgents.map((agent) => {
                const position = getAreaPosition(agent.sceneArea, agent.areaSlot);
                const bubbleShift = getBubbleShift(agent.sceneArea, agent.areaSlot);

                return (
                  <div
                    key={agent.id}
                    className={`office-agent office-agent--guest office-agent--${agent.visualState}`}
                    style={{
                      left: `${position.left}%`,
                      top: `${position.top}%`,
                      ['--bubble-shift-x' as string]: `${bubbleShift}px`,
                      ['--bubble-shift-y' as string]: `${getBubbleLift(agent.sceneArea, agent.areaSlot)}px`,
                    }}
                  >
                    <div className="office-agent__bubble">{agent.bubble}</div>
                    <div
                      className={`office-agent__sprite ${spriteClass(agent)}`}
                      style={{ backgroundImage: `url(${spritePath(agent)})` }}
                      aria-hidden="true"
                    />
                    <div className="office-agent__tag">
                      <strong>{agent.label}</strong>
                      <span>{agent.role}</span>
                    </div>
                  </div>
                );
              })}

              {primaryAgent?.visualState === 'error' ? <div className="office-prop office-prop--error-bug" /> : null}
              {primaryAgent?.visualState === 'syncing' ? <div className="office-prop office-prop--sync" /> : null}
            </div>
          </div>
          </div>

          <div className="office-stage-footer">
            <section className="office-metric-card">
              <p className="office-panel__eyebrow">Room pulse</p>
              <div className="office-metric-card__value">{busyCount}</div>
              <p>{busyCount === 1 ? 'agent currently active or blocked' : 'agents currently active or blocked'}</p>
              <dl className="office-metric-card__grid">
                <div>
                  <dt>queue</dt>
                  <dd>{queueCount}</dd>
                </div>
                <div>
                  <dt>weather</dt>
                  <dd>{condition}</dd>
                </div>
                <div>
                  <dt>music</dt>
                  <dd>{musicLabel}</dd>
                </div>
                <div>
                  <dt>updated</dt>
                  <dd>{snapshot ? formatRelativeTime(snapshot.updatedAt, now) : 'waiting'}</dd>
                </div>
              </dl>
            </section>

            <section className="office-metric-card office-metric-card--focus">
              <p className="office-panel__eyebrow">Current focus</p>
              {primaryAgent ? (
                <>
                  <h2>{primaryAgent.task?.title || primaryAgent.label}</h2>
                  <p>{primaryAgent.bubble}</p>
                  <div className="office-focus-meta">
                    <span>{primaryAgent.label}</span>
                    <span>{primaryAgent.role}</span>
                    <span>{primaryAgent.queueCount} queued</span>
                  </div>
                </>
              ) : (
                <>
                  <h2>Waiting for room state</h2>
                  <p>Add a worker URL or seed a room to bring the office online.</p>
                </>
              )}
            </section>

            <section className="office-metric-card office-metric-card--protocol">
              <p className="office-panel__eyebrow">Protocol</p>
              <ul className="office-protocol">
                <li>Astro ships the route shell and static art pack.</li>
                <li>React renders the office as a client-only live island.</li>
                <li>Worker snapshot and SSE remain the source of truth.</li>
              </ul>
            </section>
          </div>
        </div>

        <aside className="office-sidebar">
          <section className="office-panel office-panel--intro">
            <p className="office-panel__eyebrow">Live room</p>
            <h2>Astro shell with a live pixel room mounted under `/office`.</h2>
            <p>
              The visual layer is rebuilt around Star Office art, but the data plane still comes from your existing room worker.
            </p>
            <dl className="office-panel__pairs">
              <div>
                <dt>worker</dt>
                <dd>{workerBase || 'missing'}</dd>
              </div>
              <div>
                <dt>room</dt>
                <dd>{roomId}</dd>
              </div>
              <div>
                <dt>agents</dt>
                <dd>{snapshot?.agents.length ?? 0}</dd>
              </div>
            </dl>
            {!snapshot && error ? <p className="office-error">{error}</p> : null}
          </section>

          <section className="office-panel office-panel--environment">
            <div className="office-panel__header">
              <p className="office-panel__eyebrow">Atmosphere</p>
              <span>{snapshot?.environment.lighting.timeOfDay || 'standby'}</span>
            </div>
            <div className="office-atmosphere">
              <article>
                <strong>weather</strong>
                <p>{weatherLabel}</p>
              </article>
              <article>
                <strong>region</strong>
                <p>{snapshot?.environment.weather.region || 'waiting'}</p>
              </article>
              <article>
                <strong>music</strong>
                <p>{musicLabel}</p>
              </article>
            </div>
          </section>

          <section className="office-panel office-panel--memo">
            <div className="office-panel__header">
              <p className="office-panel__eyebrow">Wall notes</p>
              <span>{whiteboard.length > 0 ? `${whiteboard.length} active` : 'empty'}</span>
            </div>
            <div className="office-memo">
              {whiteboard.length > 0 ? (
                whiteboard.map((entry) => (
                  <article key={entry.agentId} className="office-memo__entry">
                    <header>
                      <strong>{entry.label}</strong>
                      <span>{formatRelativeTime(entry.updatedAt, now)}</span>
                    </header>
                    <p>{entry.summary}</p>
                  </article>
                ))
              ) : (
                <p className="office-memo__empty">No whiteboard entries yet. The room is waiting for the next update.</p>
              )}
            </div>
          </section>

          <section className="office-panel office-panel--agents">
            <div className="office-panel__header">
              <p className="office-panel__eyebrow">Agents</p>
              <span>{snapshot?.environment.music.playing ? `music: ${snapshot.environment.music.genre || 'on'}` : 'music off'}</span>
            </div>
            <div className="office-agent-list">
              {agentModels.map((agent) => (
                <article key={agent.id} className="office-agent-list__item">
                  <div className={`office-agent-list__dot office-agent-list__dot--${agent.visualState}`} />
                  <div>
                    <strong>{agent.label}</strong>
                    <p>{agent.bubble}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <footer className="office-attribution">
            Uses personal non-commercial Star Office assets as the visual layer. Runtime state comes from the existing office worker.
          </footer>
        </aside>
      </div>
    </section>
  );
}
