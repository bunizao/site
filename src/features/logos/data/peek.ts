import type { Animation, LogoDefinition, Grid } from './types';

// 10×7 — the lurker. Only the top half shows; ears + eyes peek over an invisible edge.
// "." = empty, "#" = body, "o" = eye, "*" = accent (the nose).
const G = (rows: string[]): Grid =>
  rows.map((r) =>
    r.split('').map((c) => (c === '#' ? 1 : c === 'o' ? 2 : c === '*' ? 3 : 0)),
  ) as Grid;

const BASE = G([
  '.##....##.',
  '###....###',
  '##########',
  '##########',
  '##o####o##',
  '##o##*#o##',
  '##########',
]);

const F = (s: string): Grid => G(s.split('|'));
const FArr = (arr: ReadonlyArray<string>): Grid[] => arr.map(F);
const motion = (
  name: string,
  fps: number,
  frames: ReadonlyArray<string>,
  meta: Omit<Animation, 'name' | 'fps' | 'frames'> = {},
): Animation => ({
  name,
  fps,
  frames: FArr(frames),
  ...meta,
});

// idle — soft blink, ears flick. 6 frames @ 6 fps.
const IDLE = [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
];

// hide — peek up then sink below the line. 6 frames @ 12 fps.
const HIDE = [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '..........|.##....##.|###....###|##########|##o####o##|##o##*#o##|##########',
  '..........|..........|.##....##.|###....###|##o####o##|##o##*#o##|##########',
  '..........|..........|..........|.##....##.|##o####o##|##o##*#o##|##########',
  '..........|..........|..........|..........|.##....##.|##o##*#o##|##########',
  '..........|..........|..........|..........|..........|##########|##########',
];

// pop — surprise burst: eyes go wide (2×2), ears shoot up. 8 frames @ 16 fps.
const POP = [
  '..........|..........|..........|..........|..........|##########|##########',
  '..........|..........|..........|..........|.##....##.|#####*####|##########',
  '..........|..........|.##....##.|###....###|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '###....###|###....###|##########|#oo####oo#|#oo####oo#|#####*####|##########',
  '###....###|###....###|##########|#oo####oo#|#oo####oo#|#####*####|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
];

// curious — head tilts L→center→R→center; eyes follow. 8 frames @ 10 fps.
const CURIOUS = [
  '.##....##.|###.......|##########|##########|#o####o###|#o##*#o###|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|.......###|##########|##########|###o####o#|###o#*##o#|##########',
  '.##....##.|.......###|##########|##########|###o####o#|###o#*##o#|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
];

// purr — eyes squint into > <, nose pulses. 6 frames @ 8 fps.
const PURR = [
  '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo**oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo**oo##|##########',
  '.##....##.|###....###|##########|##########|##########|##oo*#oo##|##########',
];

// dart — eyes flick L→R fast (high fps showcase). 8 frames @ 24 fps.
const DART = [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|#o####o###|#o##*#o###|##########',
  '.##....##.|###....###|##########|##########|#o####o###|#o##*#o###|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
  '.##....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########',
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|###....###|##########|##########|##########|##o##*#o##|##########',
];

// nap — eyes closed (solid body, no holes), nose pulses faintly. 4 frames @ 3 fps.
const NAP = [
  '.##....##.|###....###|##########|##########|##########|#####*####|##########',
  '.##....##.|###....###|##########|##########|##########|##########|##########',
  '.##....##.|###....###|##########|##########|##########|#####*####|##########',
  '.##....##.|###....###|##########|##########|##########|##########|##########',
];

// Five head poses — asymmetric ears sell the turn inside a flat grid.
// Used both as a loop (`scan`) and as discrete states for cursor tracking.
const POSE_FAR_LEFT    = '.#.....##.|##.....###|##########|##########|o####o####|o##*#o####|##########';
const POSE_LEFT        = '.##....###|###....###|##########|##########|#o####o###|#o##*#o###|##########';
const POSE_CENTER      = '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########';
const POSE_RIGHT       = '###....##.|###....###|##########|##########|###o####o#|###o#*##o#|##########';
const POSE_FAR_RIGHT   = '.##.....#.|###.....##|##########|##########|####o####o|####o#*##o|##########';

// scan — looks for you. dwells off-center, only passes through center briefly.
// 14 frames @ 7 fps. Cadence: L…L…C L C…R…R…C C.
const SCAN = [
  POSE_LEFT, POSE_LEFT, POSE_FAR_LEFT, POSE_FAR_LEFT, POSE_LEFT,
  POSE_CENTER,
  POSE_RIGHT, POSE_FAR_RIGHT, POSE_FAR_RIGHT, POSE_RIGHT, POSE_RIGHT,
  POSE_CENTER, POSE_CENTER, POSE_LEFT,
];

// Single-frame "animations" used for cursor-locked selection.
// The component reads frames[0] when there's only one — effectively a static pose.
const TRACK_FL = [POSE_FAR_LEFT];
const TRACK_L  = [POSE_LEFT];
const TRACK_C  = [POSE_CENTER];
const TRACK_R  = [POSE_RIGHT];
const TRACK_FR = [POSE_FAR_RIGHT];

// alert — snap to center, ears up, eyes blow open into 2×2 blocks. 5 frames @ 14 fps.
const ALERT = [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo**oo##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
  '.##....##.|.##....##.|###....###|##########|##oo##oo##|##oo#*oo##|##########',
];

// dissolve — pixels drop out scattered, nose is last. 8 frames @ 14 fps, non-looping.
const DISSOLVE = [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.#.....##.|##.....###|#########.|##.#######|##o####o##|##o##*#o##|#########.',
  '.#.....#..|##.....##.|##.######.|#..#######|#.o####.##|##o##*#o##|##.#####.#',
  '.#......#.|.#.....##.|##.####...|...######.|#.o##..#..|.#o##*#.o#|.#.#.###..',
  '..#.....#.|..#.....#.|.#...##...|...#####..|..#....#..|.#...*#...|.#...#....',
  '..#.......|..........|.....##...|.....#....|.......#..|.....*....|.#........',
  '..........|..........|.....#....|..........|..........|.....*....|..........',
  '..........|..........|..........|..........|..........|.....*....|..........',
];

export const PEEK: LogoDefinition = {
  id: 'peek',
  name: 'peek',
  tagline: 'the lurker',
  blurb: 'only the top of the head shows. listening. never types first.',
  width: 10,
  height: 7,
  base: BASE,
  accent: 'oklch(0.62 0.13 25)',
  animations: {
    idle: motion('idle', 6, IDLE, {
      label: 'Idle',
      summary: 'Soft blink and ear flick.',
      usage: 'Default rest state in the navbar.',
      kind: 'loop',
      loop: true,
      tags: ['core', 'nav'],
    }),
    hide: motion('hide', 12, HIDE, {
      label: 'Hide',
      summary: 'Drops below the ledge, then peeks back up.',
      usage: 'Useful when the mascot needs to retreat without disappearing entirely.',
      kind: 'loop',
      loop: true,
      tags: ['core', 'transition'],
    }),
    pop: motion('pop', 16, POP, {
      label: 'Pop',
      summary: 'Fast surprise burst with wide eyes.',
      usage: 'Best for sudden reveals or high-attention moments.',
      kind: 'loop',
      loop: true,
      tags: ['core', 'burst'],
    }),
    curious: motion('curious', 10, CURIOUS, {
      label: 'Curious',
      summary: 'Head tilt with tracking eyes.',
      usage: 'Triggered when desktop nav links are hovered.',
      kind: 'loop',
      loop: true,
      tags: ['core', 'nav', 'hover'],
    }),
    purr: motion('purr', 8, PURR, {
      label: 'Purr',
      summary: 'Squinting eyes and pulsing nose.',
      usage: 'The friendly baseline for positive reactions.',
      kind: 'loop',
      loop: true,
      tags: ['core', 'warm'],
    }),
    dart: motion('dart', 24, DART, {
      label: 'Dart',
      summary: 'Rapid eye flick left to right.',
      usage: 'Used for navbar hover and fast-scroll reactions.',
      kind: 'loop',
      loop: true,
      tags: ['core', 'nav', 'fast'],
    }),
    nap: motion('nap', 3, NAP, {
      label: 'Nap',
      summary: 'Closed eyes and slow nose pulse.',
      usage: 'Base sleepy state before aliasing.',
      kind: 'loop',
      loop: true,
      tags: ['core', 'rest'],
    }),
    scan: motion('scan', 7, SCAN, {
      label: 'Scan',
      summary: 'Off-center search pattern across five head poses.',
      usage: 'Good for ambient searching or sidebar motion when the mascot should feel alert.',
      kind: 'loop',
      loop: true,
      tags: ['tracking', 'ambient'],
    }),
    alert: motion('alert', 14, ALERT, {
      label: 'Alert',
      summary: 'Snaps to center and opens into 2x2 eyes.',
      usage: 'Best for short attention grabs or sudden state changes.',
      kind: 'one-shot',
      loop: false,
      previewLoop: true,
      tags: ['utility', 'burst'],
    }),
    dissolve: motion('dissolve', 14, DISSOLVE, {
      label: 'Dissolve',
      summary: 'Pixels scatter away and the nose lingers last.',
      usage: 'Exit transition when the mascot should vanish with intent.',
      kind: 'one-shot',
      loop: false,
      previewLoop: true,
      tags: ['utility', 'transition'],
    }),
    track_far_left: motion('track_far_left', 1, TRACK_FL, {
      label: 'Track Far Left',
      summary: 'Hard left static pose.',
      usage: 'Cursor-locked pose for the furthest left tracking bucket.',
      kind: 'pose',
      loop: false,
      tags: ['tracking', 'pose'],
    }),
    track_left: motion('track_left', 1, TRACK_L, {
      label: 'Track Left',
      summary: 'Left static pose.',
      usage: 'Cursor-locked pose for left tracking.',
      kind: 'pose',
      loop: false,
      tags: ['tracking', 'pose'],
    }),
    track_center: motion('track_center', 1, TRACK_C, {
      label: 'Track Center',
      summary: 'Centered static pose.',
      usage: 'Neutral lock state when the mascot faces forward.',
      kind: 'pose',
      loop: false,
      tags: ['tracking', 'pose'],
    }),
    track_right: motion('track_right', 1, TRACK_R, {
      label: 'Track Right',
      summary: 'Right static pose.',
      usage: 'Cursor-locked pose for right tracking.',
      kind: 'pose',
      loop: false,
      tags: ['tracking', 'pose'],
    }),
    track_far_right: motion('track_far_right', 1, TRACK_FR, {
      label: 'Track Far Right',
      summary: 'Hard right static pose.',
      usage: 'Cursor-locked pose for the furthest right tracking bucket.',
      kind: 'pose',
      loop: false,
      tags: ['tracking', 'pose'],
    }),
    happy: motion('happy', 8, PURR, {
      label: 'Happy',
      summary: 'Positive alias that reuses purr.',
      usage: 'Triggered when the active navbar section changes.',
      kind: 'alias',
      aliasOf: 'purr',
      loop: true,
      tags: ['alias', 'nav', 'positive'],
    }),
    sleepy: motion('sleepy', 4, NAP, {
      label: 'Sleepy',
      summary: 'Idle alias that reuses nap.',
      usage: 'Triggered after long inactivity in the navbar.',
      kind: 'alias',
      aliasOf: 'nap',
      loop: true,
      tags: ['alias', 'nav', 'idle-timeout'],
    }),
  },
  gallery: [
    {
      id: 'core',
      label: 'Core Expressions',
      description: 'The canonical emotional and idle motions that define peek as a character.',
      items: ['idle', 'curious', 'purr', 'dart', 'nap', 'hide', 'pop'],
    },
    {
      id: 'nav',
      label: 'Navbar Triggers',
      description: 'States currently wired into the live site chrome, including aliases used by nav events.',
      items: ['idle', 'dart', 'curious', 'happy', 'sleepy'],
    },
    {
      id: 'tracking',
      label: 'Tracking Poses',
      description: 'Directional poses and scan loops used when peek needs to follow or search.',
      items: ['scan', 'track_far_left', 'track_left', 'track_center', 'track_right', 'track_far_right'],
    },
    {
      id: 'utility',
      label: 'Utility Motions',
      description: 'One-shot transitions and special-purpose actions for entrances, exits, and alerts.',
      items: ['alert', 'dissolve'],
    },
  ],
  runtimeBehaviors: [
    {
      label: 'Default rest state',
      animation: 'idle',
      description: 'Navbar brand mark at rest before hover or event overrides.',
    },
    {
      label: 'Brand hover and fast scroll',
      animation: 'dart',
      description: 'Used for home hover and high-velocity scroll bursts.',
    },
    {
      label: 'Nav link hover',
      animation: 'curious',
      description: 'Desktop section links trigger a curious expression on pointer enter.',
    },
    {
      label: 'Section activation',
      animation: 'happy',
      description: 'When the active section changes, navbar code fires a short happy burst.',
    },
    {
      label: 'Long idle timeout',
      animation: 'sleepy',
      description: 'After ten seconds of inactivity, the navbar mascot falls into its sleepy alias.',
    },
  ],
};
