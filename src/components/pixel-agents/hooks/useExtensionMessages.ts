import { useEffect, useRef, useState } from 'react';

import { playDoneSound, setSoundEnabled } from '../notificationSound.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js';
import { extractToolName } from '../office/toolUtils.js';
import type { OfficeLayout, ToolActivity } from '../office/types.js';
import { setWallSprites } from '../office/wallTiles.js';

export interface SubagentCharacter {
  id: number;
  parentAgentId: number;
  parentToolId: string;
  label: string;
}

export interface FurnitureAsset {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  partOfGroup?: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

export interface ExtensionMessageState {
  agents: number[];
  selectedAgent: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  layoutReady: boolean;
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> };
  workspaceFolders: WorkspaceFolder[];
}

interface AgentSeatMeta {
  palette?: number;
  hueShift?: number;
  seatId?: string;
}

interface LocalMessage {
  type: string;
  [key: string]: unknown;
}

interface BeatSpec {
  status?: string;
  waiting?: boolean;
  permission?: boolean;
  subtask?: {
    label: string;
    status: string;
  };
}

const STORAGE_LAYOUT_KEY = 'pixel-agents:layout';
const STORAGE_SEATS_KEY = 'pixel-agents:seats';
const STORAGE_SOUND_KEY = 'pixel-agents:sound';
const DEFAULT_AGENT_COUNT = 4;
const SOURCE_URL = 'https://github.com/pablodelucca/pixel-agents/tree/main/webview-ui';
const WALL_SPRITE_URL = '/pixel-agents/assets/walls.png';
const DEFAULT_LAYOUT_URL = '/pixel-agents/assets/default-layout.json';
const DEFAULT_FOLDER_NAMES = ['site', 'content', 'design', 'ops', 'infra', 'notes'];

const BEATS: BeatSpec[][] = [
  [
    { status: 'Writing /src/pages/office.astro' },
    { status: 'Searching office renderer pipeline' },
    { status: 'Reading layout serializer details' },
    {
      status: 'Subtask: review upstream panel parity',
      subtask: {
        label: 'review upstream panel parity',
        status: 'Searching overlay and toolbar wiring',
      },
    },
  ],
  [
    { status: 'Editing local message bridge' },
    { status: 'Writing local storage persistence' },
    { waiting: true },
    { status: 'Running build verification' },
  ],
  [
    { status: 'Searching asset loader behavior' },
    { status: 'Writing wall sprite bootstrap' },
    { status: 'Reading office state transitions' },
    { status: 'Editing route shell copy', permission: true },
  ],
  [
    { status: 'Running interaction pass' },
    { status: 'Writing toolbar adjustments' },
    {
      status: 'Subtask: sync selected agent state',
      subtask: {
        label: 'sync selected agent state',
        status: 'Editing focus and close handlers',
      },
    },
    { status: 'Reading debug panel output' },
  ],
];

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in demo mode.
  }
}

function basenameFromPath(path: string | undefined, fallback: string): string {
  if (!path) {
    return fallback;
  }

  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? fallback;
}

function buildInitialAgentIds(savedSeats: Record<string, AgentSeatMeta>): number[] {
  const persistedIds = Object.keys(savedSeats)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  const targetCount = Math.max(DEFAULT_AGENT_COUNT, persistedIds.length);

  if (persistedIds.length >= targetCount) {
    return persistedIds;
  }

  const ids = [...persistedIds];

  for (let index = 1; ids.length < targetCount; index += 1) {
    if (!ids.includes(index)) {
      ids.push(index);
    }
  }

  return ids.sort((left, right) => left - right);
}

function buildFolderNames(agentIds: number[]): Record<number, string> {
  return Object.fromEntries(
    agentIds.map((id, index) => [id, DEFAULT_FOLDER_NAMES[index] ?? `agent-${id}`]),
  );
}

async function fetchDefaultLayout(): Promise<OfficeLayout | null> {
  try {
    const response = await fetch(DEFAULT_LAYOUT_URL);

    if (!response.ok) {
      return null;
    }

    const layout = (await response.json()) as OfficeLayout;
    return layout.version === 1 ? migrateLayoutColors(layout) : null;
  } catch {
    return null;
  }
}

async function loadWallSpritesFromImage(): Promise<string[][][] | null> {
  try {
    const image = new Image();
    image.src = WALL_SPRITE_URL;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0);
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    const sprites: string[][][] = [];

    for (let mask = 0; mask < 16; mask += 1) {
      const offsetX = (mask % 4) * 16;
      const offsetY = Math.floor(mask / 4) * 32;
      const sprite: string[][] = [];

      for (let row = 0; row < 32; row += 1) {
        const line: string[] = [];

        for (let col = 0; col < 16; col += 1) {
          const index = ((offsetY + row) * width + (offsetX + col)) * 4;
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const alpha = data[index + 3];

          if (alpha < 8) {
            line.push('');
            continue;
          }

          line.push(
            `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`.toUpperCase(),
          );
        }

        sprite.push(line);
      }

      sprites.push(sprite);
    }

    return sprites;
  } catch {
    return null;
  }
}

function downloadLayout(layout: OfficeLayout): void {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'pixel-agents-layout.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importLayoutFromDisk(): Promise<OfficeLayout | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];

      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as OfficeLayout;
        resolve(parsed.version === 1 ? migrateLayoutColors(parsed) : null);
      } catch {
        resolve(null);
      }
    });

    input.click();
  });
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};

  for (const character of os.characters.values()) {
    if (character.isSubagent) {
      continue;
    }

    seats[character.id] = {
      palette: character.palette,
      hueShift: character.hueShift,
      seatId: character.seatId,
    };
  }

  writeJsonStorage(STORAGE_SEATS_KEY, seats);
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [agents, setAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [agentTools, setAgentTools] = useState<Record<number, ToolActivity[]>>({});
  const [agentStatuses, setAgentStatuses] = useState<Record<number, string>>({});
  const [subagentTools, setSubagentTools] = useState<
    Record<number, Record<string, ToolActivity[]>>
  >({});
  const [subagentCharacters, setSubagentCharacters] = useState<SubagentCharacter[]>([]);
  const [layoutReady, setLayoutReady] = useState(false);
  const [loadedAssets] = useState<
    { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> } | undefined
  >(undefined);
  const [workspaceFolders] = useState<WorkspaceFolder[]>([]);
  const layoutReadyRef = useRef(false);
  const agentsRef = useRef<number[]>([]);
  const nextAgentIdRef = useRef(DEFAULT_AGENT_COUNT + 1);
  const dispatchRef = useRef<(message: LocalMessage) => Promise<void>>(async () => {});

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    let cancelled = false;
    let pendingAgents: Array<{
      id: number;
      palette?: number;
      hueShift?: number;
      seatId?: string;
      folderName?: string;
    }> = [];

    const applyLayout = (
      rawLayout: OfficeLayout | null,
      force = false,
      persist = false,
    ): void => {
      const os = getOfficeState();

      if (layoutReadyRef.current && isEditDirty?.() && !force) {
        return;
      }

      const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null;

      if (layout) {
        os.rebuildFromLayout(layout);
        if (persist) {
          writeJsonStorage(STORAGE_LAYOUT_KEY, layout);
        }
        onLayoutLoaded?.(layout);
      } else {
        onLayoutLoaded?.(os.getLayout());
      }

      for (const pendingAgent of pendingAgents) {
        os.addAgent(
          pendingAgent.id,
          pendingAgent.palette,
          pendingAgent.hueShift,
          pendingAgent.seatId,
          true,
          pendingAgent.folderName,
        );
      }

      pendingAgents = [];
      layoutReadyRef.current = true;
      setLayoutReady(true);

      if (os.characters.size > 0) {
        saveAgentSeats(os);
      }
    };

    const handleMessage = async (message: LocalMessage): Promise<void> => {
      const os = getOfficeState();

      switch (message.type) {
        case 'layoutLoaded':
          applyLayout((message.layout as OfficeLayout | null) ?? null);
          return;

        case 'existingAgents': {
          const incoming = ((message.agents as number[]) ?? []).slice().sort((left, right) => left - right);
          const meta = ((message.agentMeta as Record<number, AgentSeatMeta>) ?? {}) as Record<
            number,
            AgentSeatMeta
          >;
          const folderNames = ((message.folderNames as Record<number, string>) ?? {}) as Record<
            number,
            string
          >;

          for (const id of incoming) {
            const saved = meta[id];
            pendingAgents.push({
              id,
              palette: saved?.palette,
              hueShift: saved?.hueShift,
              seatId: saved?.seatId,
              folderName: folderNames[id],
            });
          }

          setAgents((previous) => {
            const merged = new Set(previous);
            for (const id of incoming) {
              merged.add(id);
            }
            return Array.from(merged).sort((left, right) => left - right);
          });

          nextAgentIdRef.current = Math.max(1, ...incoming) + 1;
          return;
        }

        case 'agentCreated': {
          const id = message.id as number;
          const folderName = message.folderName as string | undefined;
          setAgents((previous) =>
            previous.includes(id) ? previous : [...previous, id].sort((left, right) => left - right),
          );
          setSelectedAgent(id);
          os.addAgent(id, undefined, undefined, undefined, undefined, folderName);
          os.selectedAgentId = id;
          os.cameraFollowId = id;
          saveAgentSeats(os);
          nextAgentIdRef.current = Math.max(nextAgentIdRef.current, id + 1);
          return;
        }

        case 'agentClosed': {
          const id = message.id as number;
          setAgents((previous) => previous.filter((agentId) => agentId !== id));
          setSelectedAgent((previous) => (previous === id ? null : previous));
          setAgentTools((previous) => {
            if (!(id in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[id];
            return next;
          });
          setAgentStatuses((previous) => {
            if (!(id in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[id];
            return next;
          });
          setSubagentTools((previous) => {
            if (!(id in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[id];
            return next;
          });
          os.removeAllSubagents(id);
          setSubagentCharacters((previous) =>
            previous.filter((character) => character.parentAgentId !== id),
          );
          os.removeAgent(id);
          saveAgentSeats(os);
          return;
        }

        case 'agentSelected': {
          const id = message.id as number;
          setSelectedAgent(id);
          return;
        }

        case 'agentToolStart': {
          const id = message.id as number;
          const toolId = message.toolId as string;
          const status = message.status as string;

          setAgentTools((previous) => {
            const list = previous[id] || [];
            if (list.some((tool) => tool.toolId === toolId)) {
              return previous;
            }

            return { ...previous, [id]: [...list, { toolId, status, done: false }] };
          });

          os.setAgentTool(id, extractToolName(status));
          os.setAgentActive(id, true);
          os.clearPermissionBubble(id);

          if (status.startsWith('Subtask:')) {
            const label = status.slice('Subtask:'.length).trim();
            const subId = os.addSubagent(id, toolId);
            setSubagentCharacters((previous) => {
              if (previous.some((character) => character.id === subId)) {
                return previous;
              }

              return [...previous, { id: subId, parentAgentId: id, parentToolId: toolId, label }];
            });
          }

          return;
        }

        case 'agentToolDone': {
          const id = message.id as number;
          const toolId = message.toolId as string;
          setAgentTools((previous) => {
            const list = previous[id];
            if (!list) {
              return previous;
            }

            return {
              ...previous,
              [id]: list.map((tool) => (tool.toolId === toolId ? { ...tool, done: true } : tool)),
            };
          });
          return;
        }

        case 'agentToolsClear': {
          const id = message.id as number;
          setAgentTools((previous) => {
            if (!(id in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[id];
            return next;
          });
          setSubagentTools((previous) => {
            if (!(id in previous)) {
              return previous;
            }
            const next = { ...previous };
            delete next[id];
            return next;
          });
          os.removeAllSubagents(id);
          setSubagentCharacters((previous) =>
            previous.filter((character) => character.parentAgentId !== id),
          );
          os.setAgentTool(id, null);
          os.clearPermissionBubble(id);
          return;
        }

        case 'agentStatus': {
          const id = message.id as number;
          const status = message.status as string;
          setAgentStatuses((previous) => {
            if (status === 'active') {
              if (!(id in previous)) {
                return previous;
              }
              const next = { ...previous };
              delete next[id];
              return next;
            }

            return { ...previous, [id]: status };
          });

          os.setAgentActive(id, status === 'active');

          if (status === 'waiting') {
            os.showWaitingBubble(id);
            playDoneSound();
          }

          return;
        }

        case 'agentToolPermission': {
          const id = message.id as number;
          setAgentTools((previous) => {
            const list = previous[id];
            if (!list) {
              return previous;
            }

            return {
              ...previous,
              [id]: list.map((tool) => (tool.done ? tool : { ...tool, permissionWait: true })),
            };
          });
          os.showPermissionBubble(id);
          return;
        }

        case 'agentToolPermissionClear': {
          const id = message.id as number;
          setAgentTools((previous) => {
            const list = previous[id];
            if (!list) {
              return previous;
            }

            if (!list.some((tool) => tool.permissionWait)) {
              return previous;
            }

            return {
              ...previous,
              [id]: list.map((tool) =>
                tool.permissionWait ? { ...tool, permissionWait: false } : tool,
              ),
            };
          });
          os.clearPermissionBubble(id);
          for (const [subId, meta] of os.subagentMeta) {
            if (meta.parentAgentId === id) {
              os.clearPermissionBubble(subId);
            }
          }
          return;
        }

        case 'subagentToolStart': {
          const id = message.id as number;
          const parentToolId = message.parentToolId as string;
          const toolId = message.toolId as string;
          const status = message.status as string;

          setSubagentTools((previous) => {
            const agentEntries = previous[id] || {};
            const list = agentEntries[parentToolId] || [];
            if (list.some((tool) => tool.toolId === toolId)) {
              return previous;
            }

            return {
              ...previous,
              [id]: { ...agentEntries, [parentToolId]: [...list, { toolId, status, done: false }] },
            };
          });

          const subId = os.getSubagentId(id, parentToolId);
          if (subId !== null) {
            os.setAgentTool(subId, extractToolName(status));
            os.setAgentActive(subId, true);
          }

          return;
        }

        case 'subagentToolDone': {
          const id = message.id as number;
          const parentToolId = message.parentToolId as string;
          const toolId = message.toolId as string;
          setSubagentTools((previous) => {
            const agentEntries = previous[id];
            if (!agentEntries) {
              return previous;
            }

            const list = agentEntries[parentToolId];
            if (!list) {
              return previous;
            }

            return {
              ...previous,
              [id]: {
                ...agentEntries,
                [parentToolId]: list.map((tool) =>
                  tool.toolId === toolId ? { ...tool, done: true } : tool,
                ),
              },
            };
          });
          return;
        }

        case 'subagentClear': {
          const id = message.id as number;
          const parentToolId = message.parentToolId as string;
          setSubagentTools((previous) => {
            const agentEntries = previous[id];
            if (!agentEntries || !(parentToolId in agentEntries)) {
              return previous;
            }

            const nextEntries = { ...agentEntries };
            delete nextEntries[parentToolId];

            if (Object.keys(nextEntries).length === 0) {
              const outer = { ...previous };
              delete outer[id];
              return outer;
            }

            return { ...previous, [id]: nextEntries };
          });
          os.removeSubagent(id, parentToolId);
          setSubagentCharacters((previous) =>
            previous.filter(
              (character) =>
                !(character.parentAgentId === id && character.parentToolId === parentToolId),
            ),
          );
          return;
        }

        case 'settingsLoaded':
          setSoundEnabled(Boolean(message.soundEnabled));
          return;

        case 'wallTilesLoaded':
          setWallSprites((message.sprites as string[][][]) ?? []);
          return;

        case 'openClaude': {
          const folderPath = message.folderPath as string | undefined;
          const id = nextAgentIdRef.current;
          nextAgentIdRef.current += 1;
          await handleMessage({
            type: 'agentCreated',
            id,
            folderName: basenameFromPath(folderPath, `agent-${id}`),
          });
          return;
        }

        case 'closeAgent':
          await handleMessage({ type: 'agentClosed', id: message.id });
          return;

        case 'focusAgent': {
          const id = message.id as number;
          os.selectedAgentId = id;
          os.cameraFollowId = id;
          await handleMessage({ type: 'agentSelected', id });
          return;
        }

        case 'saveAgentSeats':
          writeJsonStorage(STORAGE_SEATS_KEY, message.seats ?? {});
          return;

        case 'saveLayout':
          writeJsonStorage(STORAGE_LAYOUT_KEY, message.layout ?? null);
          return;

        case 'setSoundEnabled':
          writeJsonStorage(STORAGE_SOUND_KEY, Boolean(message.enabled));
          setSoundEnabled(Boolean(message.enabled));
          return;

        case 'openSessionsFolder':
          window.open(SOURCE_URL, '_blank', 'noopener,noreferrer');
          return;

        case 'exportLayout':
          downloadLayout(os.getLayout());
          return;

        case 'importLayout': {
          const importedLayout = await importLayoutFromDisk();
          if (importedLayout) {
            applyLayout(importedLayout, true, true);
          }
          return;
        }

        default:
          return;
      }
    };

    dispatchRef.current = handleMessage;

    const onPostMessage = (event: Event) => {
      const customEvent = event as CustomEvent<LocalMessage>;
      void handleMessage(customEvent.detail);
    };

    window.addEventListener('pixel-agents:postmessage', onPostMessage as EventListener);

    const bootstrap = async () => {
      const savedSeats = readJsonStorage<Record<string, AgentSeatMeta>>(STORAGE_SEATS_KEY, {});
      const initialIds = buildInitialAgentIds(savedSeats);
      const folderNames = buildFolderNames(initialIds);
      const savedLayout = readJsonStorage<OfficeLayout | null>(STORAGE_LAYOUT_KEY, null);
      const soundOn = readJsonStorage<boolean>(STORAGE_SOUND_KEY, true);

      await handleMessage({ type: 'settingsLoaded', soundEnabled: soundOn });

      const wallSprites = await loadWallSpritesFromImage();
      if (!cancelled && wallSprites) {
        await handleMessage({ type: 'wallTilesLoaded', sprites: wallSprites });
      }

      if (cancelled) {
        return;
      }

      await handleMessage({
        type: 'existingAgents',
        agents: initialIds,
        agentMeta: savedSeats,
        folderNames,
      });

      if (cancelled) {
        return;
      }

      applyLayout(savedLayout ?? (await fetchDefaultLayout()), true, false);

      if (cancelled || initialIds.length === 0) {
        return;
      }

      const firstAgentId = initialIds[0];
      const os = getOfficeState();
      os.selectedAgentId = firstAgentId;
      os.cameraFollowId = firstAgentId;
      setSelectedAgent(firstAgentId);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      window.removeEventListener('pixel-agents:postmessage', onPostMessage as EventListener);
    };
  }, [getOfficeState, isEditDirty, onLayoutLoaded]);

  useEffect(() => {
    if (!layoutReady || agents.length === 0) {
      return;
    }

    let beatIndex = 0;

    const applyBeat = (nextBeatIndex: number) => {
      const activeAgents = [...agentsRef.current].sort((left, right) => left - right);

      for (const id of activeAgents) {
        void dispatchRef.current({ type: 'agentToolPermissionClear', id });
        void dispatchRef.current({ type: 'agentToolsClear', id });
      }

      activeAgents.forEach((id, slotIndex) => {
        const spec = BEATS[nextBeatIndex % BEATS.length][slotIndex] ?? {
          status: 'Writing local office scene updates',
        };

        if (spec.waiting) {
          void dispatchRef.current({ type: 'agentStatus', id, status: 'waiting' });
          return;
        }

        void dispatchRef.current({ type: 'agentStatus', id, status: 'active' });

        if (!spec.status) {
          return;
        }

        const toolId = `beat-${nextBeatIndex}-${id}`;
        void dispatchRef.current({
          type: 'agentToolStart',
          id,
          toolId,
          status: spec.status,
        });

        if (spec.permission) {
          void dispatchRef.current({ type: 'agentToolPermission', id });
        }

        if (spec.subtask) {
          void dispatchRef.current({
            type: 'subagentToolStart',
            id,
            parentToolId: toolId,
            toolId: `${toolId}:subtask`,
            status: spec.subtask.status,
          });
        }
      });
    };

    applyBeat(beatIndex);

    const intervalId = window.setInterval(() => {
      beatIndex = (beatIndex + 1) % BEATS.length;
      applyBeat(beatIndex);
    }, 5200);

    return () => window.clearInterval(intervalId);
  }, [layoutReady, agents]);

  return {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    loadedAssets,
    workspaceFolders,
  };
}
