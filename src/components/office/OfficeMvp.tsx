import {
  Activity,
  ArrowRight,
  Bot,
  Package,
  Pause,
  Play,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { cn } from "@/lib/utils";

type AgentStatus = "research" | "typing" | "review" | "blocked" | "shipping";
type AgentId = "atlas" | "nova" | "kilo" | "piper";
type ZoneId =
  | "queue"
  | "intake"
  | "research"
  | "review"
  | "deskA"
  | "deskB"
  | "deskC"
  | "ship";

interface AgentBase {
  id: AgentId;
  name: string;
  role: string;
  accent: string;
  shadow: string;
}

interface SceneAssignment {
  zone: ZoneId;
  status: AgentStatus;
  task: string;
  next: string;
  note: string;
  completion: number;
}

interface SceneEvent {
  time: string;
  text: string;
}

interface Scene {
  id: string;
  label: string;
  summary: string;
  metrics: {
    active: number;
    queue: number;
    shipped: number;
    focus: string;
  };
  events: SceneEvent[];
  assignments: Record<AgentId, SceneAssignment>;
}

interface AnimatedPosition {
  x: number;
  y: number;
}

interface ZoneConfig {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  type: "lounge" | "board" | "shelf" | "desk" | "table" | "dock";
}

interface Palette {
  background: string;
  floorA: string;
  floorB: string;
  wall: string;
  wallAccent: string;
  border: string;
  label: string;
  deskTop: string;
  deskLeg: string;
  monitor: string;
  glow: string;
  queue: string;
  shelf: string;
  table: string;
  dock: string;
  bubble: string;
  bubbleText: string;
  shadow: string;
  progressTrack: string;
  progressFill: string;
}

const WORLD = {
  width: 320,
  height: 220,
  tile: 16,
};

const SPRITE = {
  width: 10,
  height: 14,
};

const SCENE_DURATION_MS = 4200;

const ZONES: Record<ZoneId, ZoneConfig> = {
  queue: {
    label: "Queue",
    x: 20,
    y: 172,
    width: 62,
    height: 28,
    anchorX: 50,
    anchorY: 192,
    type: "lounge",
  },
  intake: {
    label: "Intake Board",
    x: 20,
    y: 26,
    width: 78,
    height: 44,
    anchorX: 56,
    anchorY: 78,
    type: "board",
  },
  research: {
    label: "Research Shelf",
    x: 224,
    y: 22,
    width: 76,
    height: 46,
    anchorX: 260,
    anchorY: 76,
    type: "shelf",
  },
  review: {
    label: "Standup",
    x: 128,
    y: 78,
    width: 64,
    height: 24,
    anchorX: 160,
    anchorY: 112,
    type: "table",
  },
  deskA: {
    label: "Desk A",
    x: 34,
    y: 120,
    width: 56,
    height: 30,
    anchorX: 60,
    anchorY: 166,
    type: "desk",
  },
  deskB: {
    label: "Desk B",
    x: 132,
    y: 120,
    width: 56,
    height: 30,
    anchorX: 160,
    anchorY: 166,
    type: "desk",
  },
  deskC: {
    label: "Desk C",
    x: 230,
    y: 120,
    width: 56,
    height: 30,
    anchorX: 258,
    anchorY: 166,
    type: "desk",
  },
  ship: {
    label: "Ship Dock",
    x: 234,
    y: 174,
    width: 66,
    height: 26,
    anchorX: 268,
    anchorY: 194,
    type: "dock",
  },
};

const AGENTS: AgentBase[] = [
  {
    id: "atlas",
    name: "Atlas",
    role: "Router",
    accent: "#63d5ff",
    shadow: "#1e6076",
  },
  {
    id: "nova",
    name: "Nova",
    role: "Builder",
    accent: "#ff9b57",
    shadow: "#8c4d1f",
  },
  {
    id: "kilo",
    name: "Kilo",
    role: "Critic",
    accent: "#97f071",
    shadow: "#3e7f2b",
  },
  {
    id: "piper",
    name: "Piper",
    role: "Runner",
    accent: "#ff7ecb",
    shadow: "#8a3167",
  },
];

const STATUS_META: Record<
  AgentStatus,
  { label: string; bubble: string; card: string }
> = {
  research: {
    label: "Scanning",
    bubble: "[]",
    card: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  },
  typing: {
    label: "Writing",
    bubble: "...",
    card: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  review: {
    label: "Review",
    bubble: "OK",
    card: "bg-lime-500/10 text-lime-700 dark:text-lime-300",
  },
  blocked: {
    label: "Waiting",
    bubble: "?!",
    card: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  },
  shipping: {
    label: "Shipping",
    bubble: "GO",
    card: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  },
};

const SCENES: Scene[] = [
  {
    id: "intake",
    label: "Repository Intake",
    summary:
      "Map Astro routes, separate shared chrome, and identify the smallest office slice worth shipping.",
    metrics: {
      active: 4,
      queue: 18,
      shipped: 1,
      focus: "Routing",
    },
    events: [
      {
        time: "09:12",
        text: "Atlas indexed src/pages, layout props, and existing section anchors.",
      },
      {
        time: "09:14",
        text: "Nova reserved a single React island instead of splitting canvas and panels.",
      },
      {
        time: "09:16",
        text: "Kilo marked the global home navigation as the first coupling to isolate.",
      },
    ],
    assignments: {
      atlas: {
        zone: "intake",
        status: "research",
        task: "Inspect routes, layout, and section wiring",
        next: "Draft subpage chrome",
        note: "Anchors belong only on the homepage.",
        completion: 74,
      },
      nova: {
        zone: "deskA",
        status: "typing",
        task: "Shape the office canvas shell and scene model",
        next: "Wire animation loop",
        note: "Keep the first pass mock-data only.",
        completion: 38,
      },
      kilo: {
        zone: "review",
        status: "review",
        task: "Reduce pixel-agents into one page worth of interaction",
        next: "Trim scope further",
        note: "Editor and filesystem watchers are cut from MVP.",
        completion: 61,
      },
      piper: {
        zone: "research",
        status: "research",
        task: "Translate React 19 plus Canvas 2D into local constraints",
        next: "Validate hydration path",
        note: "No third-party pixel assets required.",
        completion: 46,
      },
    },
  },
  {
    id: "layout",
    label: "Layout Split",
    summary:
      "Lift the office into its own route and shape a wide viewport that still feels native to the site.",
    metrics: {
      active: 4,
      queue: 14,
      shipped: 2,
      focus: "Shell",
    },
    events: [
      {
        time: "09:24",
        text: "Atlas added a subpage mode that keeps theme controls but removes homepage anchors.",
      },
      {
        time: "09:27",
        text: "Nova carved the office into hero, canvas, telemetry, and next-step blocks.",
      },
      {
        time: "09:31",
        text: "Piper converted the source stack notes into page badges and shipping cues.",
      },
    ],
    assignments: {
      atlas: {
        zone: "deskB",
        status: "typing",
        task: "Add Layout prop for child pages",
        next: "Mount /office route",
        note: "Theme controls stay global for consistency.",
        completion: 88,
      },
      nova: {
        zone: "deskA",
        status: "typing",
        task: "Build responsive office shell and card rhythm",
        next: "Tune mobile spacing",
        note: "Canvas stays primary on smaller screens.",
        completion: 56,
      },
      kilo: {
        zone: "review",
        status: "review",
        task: "Check tone against the existing monochrome system",
        next: "Approve accent usage",
        note: "Use accents as signals, not decoration.",
        completion: 69,
      },
      piper: {
        zone: "queue",
        status: "research",
        task: "Prepare shipping copy and source references",
        next: "Document MVP edges",
        note: "Focus on what the prototype proves.",
        completion: 52,
      },
    },
  },
  {
    id: "simulation",
    label: "Simulation Pass",
    summary:
      "Animate agents across desks, review, and queue so the office reads like a living system even on mock data.",
    metrics: {
      active: 4,
      queue: 11,
      shipped: 3,
      focus: "Motion",
    },
    events: [
      {
        time: "09:39",
        text: "Nova swapped static cards for a canvas loop with pixel-snapped desks and bubbles.",
      },
      {
        time: "09:42",
        text: "Atlas assigned each beat to real coordinates instead of free-floating sprites.",
      },
      {
        time: "09:45",
        text: "Kilo asked for reduced-motion safety before the beat loop could ship.",
      },
    ],
    assignments: {
      atlas: {
        zone: "research",
        status: "research",
        task: "Feed targets into the office beat rotation",
        next: "Stabilize click hitboxes",
        note: "Anchor movement to named zones.",
        completion: 81,
      },
      nova: {
        zone: "deskC",
        status: "typing",
        task: "Render pixel desks, walls, dock, and speech bubbles",
        next: "Tune selected-agent outline",
        note: "All motion is generated, no spritesheet.",
        completion: 72,
      },
      kilo: {
        zone: "review",
        status: "blocked",
        task: "Pause motion for accessibility review",
        next: "Approve beat controls",
        note: "The beat loop must remain optional.",
        completion: 63,
      },
      piper: {
        zone: "ship",
        status: "shipping",
        task: "Move build notes toward the ship dock",
        next: "Check route copy",
        note: "Prototype is nearly coherent.",
        completion: 77,
      },
    },
  },
  {
    id: "polish",
    label: "Interface Polish",
    summary:
      "Close the loop with telemetry cards, event logs, and a clear explanation of what this page is proving.",
    metrics: {
      active: 4,
      queue: 8,
      shipped: 4,
      focus: "Telemetry",
    },
    events: [
      {
        time: "09:53",
        text: "Piper turned scene summaries into operator-friendly office telemetry.",
      },
      {
        time: "09:57",
        text: "Kilo tightened card density so the page reads like a dashboard, not a landing page.",
      },
      {
        time: "10:01",
        text: "Atlas linked the selected agent card back to the canvas state.",
      },
    ],
    assignments: {
      atlas: {
        zone: "deskB",
        status: "typing",
        task: "Bind selected-agent state across canvas and cards",
        next: "Verify click feedback",
        note: "One control surface, two views.",
        completion: 90,
      },
      nova: {
        zone: "deskA",
        status: "typing",
        task: "Balance page sections and motion weight",
        next: "Trim any decorative noise",
        note: "Interaction should stay readable.",
        completion: 85,
      },
      kilo: {
        zone: "review",
        status: "review",
        task: "Review copy, contrast, and scene pacing",
        next: "Green-light build",
        note: "Dashboard density remains intentional.",
        completion: 86,
      },
      piper: {
        zone: "queue",
        status: "research",
        task: "Draft MVP boundaries and next slices",
        next: "Queue post-build notes",
        note: "Explain what is fake and what is real.",
        completion: 71,
      },
    },
  },
  {
    id: "ship",
    label: "Ship Candidate",
    summary:
      "The route is ready: office scene, telemetry panel, reduced-motion fallback, and source framing all in place.",
    metrics: {
      active: 4,
      queue: 5,
      shipped: 5,
      focus: "Ship",
    },
    events: [
      {
        time: "10:09",
        text: "Piper moved the final summary into the dock while the scene count rolled over.",
      },
      {
        time: "10:12",
        text: "Nova cleaned the canvas frame and confirmed the page still reads in dark mode.",
      },
      {
        time: "10:15",
        text: "Kilo approved the MVP as a faithful reduction, not a clone, of pixel-agents.",
      },
    ],
    assignments: {
      atlas: {
        zone: "ship",
        status: "shipping",
        task: "Release /office into the site map",
        next: "Collect real agent data later",
        note: "Route wiring is complete.",
        completion: 100,
      },
      nova: {
        zone: "deskC",
        status: "typing",
        task: "Final pass on the canvas frame and labels",
        next: "Leave hooks for live data",
        note: "Static simulation first, instrumentation later.",
        completion: 94,
      },
      kilo: {
        zone: "review",
        status: "review",
        task: "Review build output and residual risks",
        next: "Sign off",
        note: "Scope stayed disciplined.",
        completion: 92,
      },
      piper: {
        zone: "queue",
        status: "blocked",
        task: "Wait for future integrations",
        next: "Wire real transcript sources",
        note: "This page ends at mock telemetry.",
        completion: 79,
      },
    },
  },
];

function getPalette(isDark: boolean): Palette {
  if (isDark) {
    return {
      background: "#080a0d",
      floorA: "#11151b",
      floorB: "#0d1116",
      wall: "#212832",
      wallAccent: "#33404f",
      border: "#5a6675",
      label: "#d3dae5",
      deskTop: "#8f9bab",
      deskLeg: "#445160",
      monitor: "#6ee7f2",
      glow: "#143946",
      queue: "#3d2f58",
      shelf: "#23424d",
      table: "#494161",
      dock: "#314e3a",
      bubble: "#f8fafc",
      bubbleText: "#0f172a",
      shadow: "rgba(0, 0, 0, 0.45)",
      progressTrack: "#141922",
      progressFill: "#d1ab37",
    };
  }

  return {
    background: "#f9f5ef",
    floorA: "#efe5d7",
    floorB: "#eadfce",
    wall: "#d0c2af",
    wallAccent: "#b6a692",
    border: "#65584a",
    label: "#2c251e",
    deskTop: "#7c6853",
    deskLeg: "#564637",
    monitor: "#1f7a8c",
    glow: "#b8e8f2",
    queue: "#d9cae7",
    shelf: "#b4d7dd",
    table: "#d8d1ea",
    dock: "#c5dfc4",
    bubble: "#1f2937",
    bubbleText: "#ffffff",
    shadow: "rgba(73, 59, 44, 0.16)",
    progressTrack: "#ded3c3",
    progressFill: "#b68a1f",
  };
}

function drawPixelLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  context.font = '6px "JetBrains Mono", monospace';
  context.fillStyle = color;
  context.textBaseline = "top";
  context.fillText(text.toUpperCase(), x, y);
}

function drawDesk(
  context: CanvasRenderingContext2D,
  zone: ZoneConfig,
  palette: Palette,
  isActive: boolean,
) {
  context.fillStyle = isActive ? palette.glow : palette.deskLeg;
  context.fillRect(zone.x + 2, zone.y + 22, zone.width - 4, 2);

  context.fillStyle = palette.deskTop;
  context.fillRect(zone.x, zone.y + 6, zone.width, 14);
  context.fillRect(zone.x + 4, zone.y + 20, 4, 10);
  context.fillRect(zone.x + zone.width - 8, zone.y + 20, 4, 10);

  context.fillStyle = palette.monitor;
  context.fillRect(zone.x + 22, zone.y, 12, 6);
  context.fillStyle = palette.border;
  context.fillRect(zone.x + 26, zone.y + 6, 4, 2);

  drawPixelLabel(context, zone.label, zone.x, zone.y + zone.height + 4, palette.label);
}

function drawBoard(context: CanvasRenderingContext2D, zone: ZoneConfig, palette: Palette) {
  context.fillStyle = palette.wallAccent;
  context.fillRect(zone.x, zone.y, zone.width, zone.height);
  context.fillStyle = palette.wall;
  context.fillRect(zone.x + 4, zone.y + 4, zone.width - 8, zone.height - 8);
  context.fillStyle = palette.bubble;
  context.fillRect(zone.x + 10, zone.y + 9, 12, 6);
  context.fillRect(zone.x + 28, zone.y + 12, 18, 4);
  context.fillRect(zone.x + 52, zone.y + 9, 10, 8);
  context.fillStyle = palette.border;
  context.fillRect(zone.x + 10, zone.y + 25, zone.width - 20, 2);
  drawPixelLabel(context, zone.label, zone.x, zone.y + zone.height + 4, palette.label);
}

function drawShelf(context: CanvasRenderingContext2D, zone: ZoneConfig, palette: Palette) {
  context.fillStyle = palette.shelf;
  context.fillRect(zone.x, zone.y + 2, zone.width, zone.height - 4);
  context.fillStyle = palette.border;
  context.fillRect(zone.x + 6, zone.y + 8, zone.width - 12, 2);
  context.fillRect(zone.x + 6, zone.y + 19, zone.width - 12, 2);
  context.fillRect(zone.x + 6, zone.y + 30, zone.width - 12, 2);
  context.fillStyle = palette.bubble;
  context.fillRect(zone.x + 10, zone.y + 10, 6, 8);
  context.fillRect(zone.x + 20, zone.y + 10, 4, 8);
  context.fillRect(zone.x + 28, zone.y + 10, 8, 8);
  context.fillRect(zone.x + 40, zone.y + 10, 10, 8);
  drawPixelLabel(context, zone.label, zone.x, zone.y + zone.height + 4, palette.label);
}

function drawTable(context: CanvasRenderingContext2D, zone: ZoneConfig, palette: Palette) {
  context.fillStyle = palette.table;
  context.fillRect(zone.x, zone.y + 4, zone.width, zone.height - 8);
  context.fillStyle = palette.border;
  context.fillRect(zone.x + 6, zone.y, zone.width - 12, 4);
  context.fillRect(zone.x + 12, zone.y + zone.height - 4, 4, 4);
  context.fillRect(zone.x + zone.width - 16, zone.y + zone.height - 4, 4, 4);
  drawPixelLabel(context, zone.label, zone.x + 8, zone.y + zone.height + 4, palette.label);
}

function drawDock(context: CanvasRenderingContext2D, zone: ZoneConfig, palette: Palette) {
  context.fillStyle = palette.dock;
  context.fillRect(zone.x, zone.y + 6, zone.width, zone.height - 6);
  context.fillStyle = palette.border;
  context.fillRect(zone.x + 6, zone.y + 11, zone.width - 12, 2);
  context.fillRect(zone.x + 10, zone.y + 16, zone.width - 20, 2);
  context.fillStyle = palette.bubble;
  context.fillRect(zone.x + zone.width - 16, zone.y, 12, 8);
  drawPixelLabel(context, zone.label, zone.x, zone.y + zone.height + 4, palette.label);
}

function drawLounge(context: CanvasRenderingContext2D, zone: ZoneConfig, palette: Palette) {
  context.fillStyle = palette.queue;
  context.fillRect(zone.x, zone.y + 10, zone.width, zone.height - 10);
  context.fillStyle = palette.border;
  context.fillRect(zone.x + 6, zone.y + 6, zone.width - 12, 4);
  context.fillRect(zone.x + 8, zone.y + 18, 8, 2);
  context.fillRect(zone.x + 22, zone.y + 18, 8, 2);
  context.fillRect(zone.x + 36, zone.y + 18, 8, 2);
  drawPixelLabel(context, zone.label, zone.x, zone.y + zone.height + 4, palette.label);
}

function drawZone(
  context: CanvasRenderingContext2D,
  zone: ZoneConfig,
  palette: Palette,
  isActive: boolean,
) {
  switch (zone.type) {
    case "desk":
      drawDesk(context, zone, palette, isActive);
      return;
    case "board":
      drawBoard(context, zone, palette);
      return;
    case "shelf":
      drawShelf(context, zone, palette);
      return;
    case "table":
      drawTable(context, zone, palette);
      return;
    case "dock":
      drawDock(context, zone, palette);
      return;
    case "lounge":
      drawLounge(context, zone, palette);
      return;
  }
}

function drawBubble(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  palette: Palette,
) {
  const width = Math.max(16, text.length * 6 + 6);

  context.fillStyle = palette.bubble;
  context.fillRect(x - width / 2, y - 10, width, 8);
  context.fillRect(x - 2, y - 2, 4, 4);

  context.fillStyle = palette.bubbleText;
  context.font = '6px "JetBrains Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x, y - 6);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

function drawAgent(
  context: CanvasRenderingContext2D,
  agent: AgentBase,
  status: AgentStatus,
  x: number,
  y: number,
  selected: boolean,
  timestamp: number,
  palette: Palette,
  reducedMotion: boolean,
) {
  const bob = reducedMotion ? 0 : Math.sin(timestamp / 180 + x / 13) * 0.9;
  const frame = reducedMotion ? 0 : Math.floor(timestamp / 120 + x) % 2;
  const baseX = Math.round(x);
  const baseY = Math.round(y + bob);

  context.fillStyle = palette.shadow;
  context.fillRect(baseX - 3, baseY + 12, 12, 2);

  if (selected) {
    context.fillStyle = "#d4af37";
    context.fillRect(baseX - 5, baseY - 3, 14, 1);
    context.fillRect(baseX - 5, baseY + 13, 14, 1);
    context.fillRect(baseX - 5, baseY - 3, 1, 17);
    context.fillRect(baseX + 8, baseY - 3, 1, 17);
  }

  context.fillStyle = "#171717";
  context.fillRect(baseX + 1, baseY + 11, 2, 3);
  context.fillRect(baseX + 5, baseY + 11, 2, 3);

  if (status === "typing" && !reducedMotion) {
    context.fillRect(baseX + (frame === 0 ? 0 : 1), baseY + 9, 2, 2);
    context.fillRect(baseX + (frame === 0 ? 7 : 6), baseY + 9, 2, 2);
  } else {
    context.fillRect(baseX, baseY + 8, 2, 2);
    context.fillRect(baseX + 6, baseY + 8, 2, 2);
  }

  context.fillStyle = agent.accent;
  context.fillRect(baseX + 1, baseY + 5, 6, 6);
  context.fillStyle = agent.shadow;
  context.fillRect(baseX + 1, baseY + 9, 6, 2);
  context.fillStyle = "#f5d4b6";
  context.fillRect(baseX + 2, baseY + 1, 4, 4);
  context.fillStyle = "#101010";
  context.fillRect(baseX + 2, baseY, 4, 1);
  context.fillRect(baseX + 3, baseY + 2, 1, 1);
  context.fillRect(baseX + 5, baseY + 2, 1, 1);

  if (status === "research") {
    context.fillStyle = "#d6f4ff";
    context.fillRect(baseX + 7, baseY + 4, 2, 4);
  }

  if (status === "shipping") {
    context.fillStyle = "#ffffff";
    context.fillRect(baseX + 7, baseY + 5, 2, 2);
  }

  if (selected || status === "blocked" || status === "shipping") {
    drawBubble(context, STATUS_META[status].bubble, baseX + 2, baseY - 3, palette);
  }
}

function drawOfficeFrame(
  context: CanvasRenderingContext2D,
  palette: Palette,
  focusZone: ZoneId,
  progress: number,
) {
  context.clearRect(0, 0, WORLD.width, WORLD.height);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, WORLD.width, WORLD.height);

  for (let y = 0; y < WORLD.height; y += WORLD.tile) {
    for (let x = 0; x < WORLD.width; x += WORLD.tile) {
      const evenTile = (x / WORLD.tile + y / WORLD.tile) % 2 === 0;
      context.fillStyle = evenTile ? palette.floorA : palette.floorB;
      context.fillRect(x, y, WORLD.tile, WORLD.tile);
    }
  }

  context.fillStyle = palette.wall;
  context.fillRect(0, 0, WORLD.width, 12);
  context.fillRect(0, 0, 12, WORLD.height);
  context.fillRect(WORLD.width - 12, 0, 12, WORLD.height);
  context.fillRect(0, WORLD.height - 12, WORLD.width, 12);

  context.fillStyle = palette.wallAccent;
  context.fillRect(12, 12, WORLD.width - 24, 2);
  context.fillRect(12, WORLD.height - 14, WORLD.width - 24, 2);

  context.fillStyle = palette.border;
  context.fillRect(104, 18, 2, 72);
  context.fillRect(214, 18, 2, 72);
  context.fillRect(22, 108, WORLD.width - 44, 2);

  for (const [zoneId, zone] of Object.entries(ZONES) as Array<[ZoneId, ZoneConfig]>) {
    drawZone(context, zone, palette, zoneId === focusZone);
  }

  context.fillStyle = palette.border;
  context.fillRect(16, 16, WORLD.width - 32, 1);
  context.fillRect(16, WORLD.height - 17, WORLD.width - 32, 1);
  context.fillRect(16, 16, 1, WORLD.height - 32);
  context.fillRect(WORLD.width - 17, 16, 1, WORLD.height - 32);

  drawPixelLabel(context, "OFFICE MVP", 22, 18, palette.label);
  drawPixelLabel(context, "PIXEL MODE", 214, 18, palette.label);

  context.fillStyle = palette.progressTrack;
  context.fillRect(20, WORLD.height - 24, WORLD.width - 40, 4);
  context.fillStyle = palette.progressFill;
  context.fillRect(20, WORLD.height - 24, Math.floor((WORLD.width - 40) * progress), 4);
}

function OfficeMvp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<Record<AgentId, AnimatedPosition>>({
    atlas: { x: ZONES.intake.anchorX, y: ZONES.intake.anchorY },
    nova: { x: ZONES.deskA.anchorX, y: ZONES.deskA.anchorY },
    kilo: { x: ZONES.review.anchorX, y: ZONES.review.anchorY },
    piper: { x: ZONES.research.anchorX, y: ZONES.research.anchorY },
  });
  const beatStartedAtRef = useRef<number>(0);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>("atlas");
  const [isRunning, setIsRunning] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const currentScene = SCENES[sceneIndex];
  const selectedAgent = AGENTS.find((agent) => agent.id === selectedAgentId) ?? AGENTS[0];
  const selectedAssignment = currentScene.assignments[selectedAgent.id];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setPrefersReducedMotion(media.matches);

    syncPreference();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncPreference);
      return () => media.removeEventListener("change", syncPreference);
    }

    media.addListener(syncPreference);
    return () => media.removeListener(syncPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsRunning(false);
    }
  }, [prefersReducedMotion]);

  useEffect(() => {
    beatStartedAtRef.current = performance.now();
  }, [sceneIndex]);

  const advanceScene = useEffectEvent(() => {
    startTransition(() => {
      setSceneIndex((current) => (current + 1) % SCENES.length);
    });
  });

  useEffect(() => {
    if (!isRunning || prefersReducedMotion) {
      return;
    }

    const intervalId = window.setInterval(() => {
      advanceScene();
    }, SCENE_DURATION_MS);

    return () => window.clearInterval(intervalId);
  }, [advanceScene, isRunning, prefersReducedMotion]);

  const drawBeat = useEffectEvent((timestamp: number) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;

    const isDark = document.documentElement.classList.contains("dark");
    const palette = getPalette(isDark);
    const progress = prefersReducedMotion
      ? 1
      : Math.min(1, (timestamp - beatStartedAtRef.current) / SCENE_DURATION_MS);

    drawOfficeFrame(context, palette, selectedAssignment.zone, progress);

    for (const agent of AGENTS) {
      const assignment = currentScene.assignments[agent.id];
      const zone = ZONES[assignment.zone];
      const currentPosition = positionsRef.current[agent.id] ?? {
        x: zone.anchorX,
        y: zone.anchorY,
      };
      const targetX = zone.anchorX;
      const targetY = zone.anchorY;

      if (prefersReducedMotion) {
        currentPosition.x = targetX;
        currentPosition.y = targetY;
      } else {
        currentPosition.x += (targetX - currentPosition.x) * 0.1;
        currentPosition.y += (targetY - currentPosition.y) * 0.1;
      }

      positionsRef.current[agent.id] = currentPosition;

      drawAgent(
        context,
        agent,
        assignment.status,
        currentPosition.x,
        currentPosition.y,
        selectedAgentId === agent.id,
        timestamp,
        palette,
        prefersReducedMotion,
      );
    }
  });

  useEffect(() => {
    let animationFrameId = 0;

    const render = (timestamp: number) => {
      drawBeat(timestamp);
      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [drawBeat]);

  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = WORLD.width / bounds.width;
    const scaleY = WORLD.height / bounds.height;
    const pointerX = (event.clientX - bounds.left) * scaleX;
    const pointerY = (event.clientY - bounds.top) * scaleY;

    for (const agent of [...AGENTS].reverse()) {
      const position = positionsRef.current[agent.id];

      if (!position) {
        continue;
      }

      if (
        pointerX >= position.x - 6 &&
        pointerX <= position.x + SPRITE.width &&
        pointerY >= position.y - 6 &&
        pointerY <= position.y + SPRITE.height
      ) {
        setSelectedAgentId(agent.id);
        return;
      }
    }
  }

  const telemetryCards = [
    {
      label: "Active Agents",
      value: String(currentScene.metrics.active),
      icon: Bot,
    },
    {
      label: "Backlog",
      value: String(currentScene.metrics.queue),
      icon: TerminalSquare,
    },
    {
      label: "Shipped",
      value: String(currentScene.metrics.shipped),
      icon: Package,
    },
    {
      label: "Focus",
      value: currentScene.metrics.focus,
      icon: Sparkles,
    },
  ];

  return (
    <div className="rounded-[28px] border border-foreground/10 bg-background/85 p-4 shadow-[0_30px_90px_-45px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-5 border-b border-foreground/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
            Office Beat
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            {currentScene.label}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
            {currentScene.summary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRunning((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-background px-4 py-2 text-[13px] font-medium text-foreground transition hover:border-foreground/30 hover:bg-foreground/5"
          >
            {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isRunning ? "Pause beat" : "Resume beat"}
          </button>
          <button
            type="button"
            onClick={() => advanceScene()}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground px-4 py-2 text-[13px] font-medium text-background transition hover:opacity-90"
          >
            <ArrowRight className="h-4 w-4" />
            Next beat
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-foreground/10 bg-foreground/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                  Pixel Canvas
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click an agent to sync focus with the telemetry column.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                React 19 + Canvas 2D
              </div>
            </div>

            <canvas
              ref={canvasRef}
              width={WORLD.width}
              height={WORLD.height}
              onClick={handleCanvasClick}
              aria-label="Pixel office simulation"
              className="block aspect-[320/220] w-full cursor-pointer rounded-[18px] border border-foreground/10 bg-[#0c1015] [image-rendering:pixelated]"
            />

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="rounded-full border border-foreground/10 px-2 py-1">
                mock data
              </span>
              <span className="rounded-full border border-foreground/10 px-2 py-1">
                scene rotation
              </span>
              <span className="rounded-full border border-foreground/10 px-2 py-1">
                reduced motion safe
              </span>
            </div>
          </div>

          <div className="rounded-[24px] border border-foreground/10 bg-foreground/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                  Event Log
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  What changed during the current office beat.
                </p>
              </div>
              <span className="rounded-full border border-foreground/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {currentScene.id}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {currentScene.events.map((item) => (
                <div
                  key={`${currentScene.id}-${item.time}`}
                  className="rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3"
                >
                  <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    <span>{item.time}</span>
                    <span className="h-px flex-1 bg-foreground/10" />
                  </div>
                  <p className="mt-2 text-sm leading-7 text-foreground/80">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {telemetryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[20px] border border-foreground/10 bg-foreground/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span className="text-[11px] uppercase tracking-[0.24em]">
                    {card.label}
                  </span>
                  <card.icon className="h-4 w-4" />
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-foreground/10 bg-foreground/[0.03] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                  Selected Agent
                </p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">
                  {selectedAgent.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{selectedAgent.role}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em]",
                  STATUS_META[selectedAssignment.status].card,
                )}
              >
                {STATUS_META[selectedAssignment.status].label}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-foreground/10 bg-background/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Current Task
              </p>
              <p className="mt-2 text-sm leading-7 text-foreground/85">
                {selectedAssignment.task}
              </p>
              <div className="mt-4 h-2 rounded-full bg-foreground/10">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${selectedAssignment.completion}%`,
                    backgroundColor: selectedAgent.accent,
                  }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <span>{selectedAssignment.completion}% complete</span>
                <span>{ZONES[selectedAssignment.zone].label}</span>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-foreground/10 bg-background/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Next
                </p>
                <p className="mt-2 leading-7 text-foreground/85">{selectedAssignment.next}</p>
              </div>
              <div className="rounded-2xl border border-foreground/10 bg-background/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Note
                </p>
                <p className="mt-2 leading-7 text-foreground/85">{selectedAssignment.note}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-foreground/10 bg-foreground/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                  Agent Matrix
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Four roles, one beat-driven office.
                </p>
              </div>
              {prefersReducedMotion ? (
                <span className="rounded-full border border-foreground/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  Reduced motion
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {AGENTS.map((agent) => {
                const assignment = currentScene.assignments[agent.id];
                const isSelected = selectedAgentId === agent.id;

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={cn(
                      "w-full rounded-[20px] border px-4 py-4 text-left transition",
                      isSelected
                        ? "border-foreground/30 bg-background shadow-[0_18px_40px_-28px_rgba(0,0,0,0.55)]"
                        : "border-foreground/10 bg-background/70 hover:border-foreground/20 hover:bg-background",
                    )}
                    style={
                      isSelected
                        ? {
                            boxShadow: `0 0 0 1px ${agent.accent}55`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: agent.accent }}
                          />
                          <span className="text-sm font-semibold text-foreground">
                            {agent.name}
                          </span>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                          {agent.role}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em]",
                          STATUS_META[assignment.status].card,
                        )}
                      >
                        {STATUS_META[assignment.status].label}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-7 text-foreground/80">{assignment.task}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      <span>{ZONES[assignment.zone].label}</span>
                      <span>{assignment.completion}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default OfficeMvp;
