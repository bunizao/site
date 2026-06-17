// Single source of truth for site copy. Sections import their slice; seo.ts
// derives its identity strings from `profile` so the same fact is never typed
// twice. Plain typed module on purpose — Content Collections are for MD/MDX
// documents, not UI labels.
import type { ComponentType } from 'react';
import { FileText, Github, Mail, Send, Instagram, GraduationCap, type LucideIcon } from 'lucide-react';
import { OpenAIIcon, AnthropicIcon } from '@/components/icons';

// --- Site meta --------------------------------------------------------------
// Site-level identity strings: page titles, og:site_name, and the default
// OG/meta description. seo.ts and Layout.astro read these instead of inlining.

export const meta = {
  siteName: 'Bunizao',
  siteUrl: 'https://buxx.me',
  homeTitle: "Bunizao's Website",
  // Default OG / meta description used on the home page and as the fallback.
  description:
    'Build and then polish. Ship and then reflect. Write, shoot, and think in between. I\'m Lucian.',
};

// --- Identity ---------------------------------------------------------------
// The canonical "who I am" facts. seo.ts reads name/jobTitle/knowsAbout/links
// from here instead of re-declaring them.

export interface ProfileLink {
  /** Display name, also used as the social chip label. */
  name: string;
  url: string;
  icon: LucideIcon;
  /** Hover description shown on the hero social chips. */
  description: string;
  /** Short handle shown under the chip. */
  handle: string;
  /** Include in schema.org `sameAs` (omit mailto / non-profile links). */
  sameAs?: boolean;
  /** Canonical destination for `sameAs` when the chip uses a vanity redirect. */
  canonicalUrl?: string;
}

export const profile = {
  name: 'Lucian Bu',
  alternateNames: ['Bunizao', 'Tutu', 'Collapsar'],
  jobTitle: 'Student / Developer / Blogger',
  email: 'me@buxx.me',
  knowsAbout: [
    'Frontend design',
    'Proxy systems',
    'Open source software',
    'Automation',
    'Performance optimization',
  ],
  links: [
    { name: 'Blog', url: 'https://blog.buxx.me', icon: FileText, description: 'Read my articles', handle: 'blog.buxx.me', sameAs: true },
    { name: 'GitHub', url: 'https://tuu.cat/gh', icon: Github, description: 'Check out my code', handle: '@bunizao', sameAs: true, canonicalUrl: 'https://github.com/bunizao' },
    { name: 'Email', url: 'mailto:me@buxx.me', icon: Mail, description: 'Send me a message', handle: 'me@buxx.me' },
    { name: 'Telegram', url: 'https://tuu.cat/tg', icon: Send, description: 'Chat with me', handle: 'tuu.cat/tg', sameAs: true },
    { name: 'Instagram', url: 'https://tuu.cat/ig', icon: Instagram, description: 'See my photos', handle: 'tuu.cat/ig', sameAs: true },
  ] satisfies ProfileLink[],
} as const;

// --- Hero -------------------------------------------------------------------

export const hero = {
  typewriterNames: ['Lucian', 'Bunizao', 'Tutu', 'Collapsar'],
  infoChips: ['18 y.o.', 'INFP', 'Libra'],
  // Rotating status verbs in the green dot.
  statusWords: [
    'Wondering', 'Building', 'Learning', 'Exploring', 'Creating', 'Thinking',
    'Coding', 'Designing', 'Reading', 'Writing', 'Debugging', 'Shipping',
    'Dreaming', 'Hacking', 'Optimizing', 'Iterating', 'Refactoring', 'Brewing',
    'Crafting', 'Tinkering', 'Pondering', 'Researching', 'Prototyping',
    'Deploying', 'Solving',
  ],
  socials: profile.links,

  // One line per visual line; `**...**` marks the single highlight effect
  // (rendered as <span class="text-foreground"> for the hero decode reveal).
  bio: [
    'I make interesting things.',
    'Curious about **frontend design**, **proxy systems**, and contributing to **open source**.',
    'Obsessed with **speed** and always asking how things can be **better**.',
    'Outside of coding, I read for curiosity and write to make sense of things.',
    'Currently studying Computer Science at **Monash University**.',
  ],
};

// --- Tech marquee -----------------------------------------------------------

export const tech = {
  row1: ['TypeScript', 'JavaScript', 'Python', 'C#', 'C++', 'React', 'TailwindCSS', 'Astro'],
  row2: ['Frontend', 'BGP', 'Proxy', 'Docker', 'Linux', 'Web3', 'Optimization'],
};

// --- Experience -------------------------------------------------------------
// Icons are component references (rendered with `className`/`strokeWidth` by
// the timeline), not JSX elements, so this stays a plain data file.

type ExperienceIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

export interface ExperienceItem {
  org: string;
  url: string;
  period: string;
  icon: ExperienceIcon;
  strokeWidth?: number;
  /** Primary line under the org (subscription roles). */
  role?: string;
  /** Monash carries a fuller description + location instead of a role. */
  description?: string;
  location?: string;
  /** Pulsing dot — the one role that's genuinely current. */
  current?: boolean;
  /** Hidden behind a blur until hovered; reveals with a particle burst. */
  joke?: boolean;
}

export const experience: ExperienceItem[] = [
  {
    org: 'Monash University',
    url: 'https://www.monash.edu',
    period: 'Jul 2025 — Present',
    icon: GraduationCap,
    strokeWidth: 1.8,
    description: "Studying for a Bachelor's degree in Data Science (Honours)",
    location: 'Clayton, Melbourne, Australia',
    current: true,
  },
  {
    org: 'Anthropic',
    url: 'https://www.anthropic.com',
    period: '2025 — Present',
    icon: AnthropicIcon,
    role: 'Subscriber, Claude',
    joke: true,
  },
  {
    org: 'OpenAI',
    url: 'https://openai.com',
    period: '2023 — Present',
    icon: OpenAIIcon,
    role: 'Subscriber, ChatGPT & Codex',
    joke: true,
  },
];

// --- Section visibility -----------------------------------------------------
// Toggle whole homepage sections on/off. Default every section on; flip one to
// false to drop it from the page (index.astro guards each render on this).

export const sections = {
  hero: true,
  experience: true,
  projects: true,
  posts: true,
  mood: true, // the HomePreview / mood teaser block
  footer: true,
};

// --- Footer -----------------------------------------------------------------
// Nav links + status endpoint are editable here. The copyright credit is NOT:
// see copyrightMark() below.

export const footer = {
  links: [
    { label: 'Source', url: 'https://github.com/bunizao/site', external: true },
    { label: 'Built with Astro', url: 'https://astro.build', external: true },
    { label: 'Privacy', url: '/privacy' },
  ],
  statusUrl: 'https://status.tuuhub.com',
};

// The copyright credit is LOAD-BEARING. copyrightMark() rebuilds it from the
// sealed owner/rights/start-year below and verifies them against CREDIT_SEAL
// (an FNV-1a hash baked at authoring time). Edit the owner or the
// "All rights reserved." text and the seal stops matching — the function throws
// and the whole build/render dies. The ONLY moving part is the end year, which
// tracks the current year. Yes, this guard is on purpose. Put it back. 🫷
const CREDIT_OWNER = 'bunizao';
const CREDIT_RIGHTS = 'All rights reserved.';
const CREDIT_START_YEAR = 2023;
const CREDIT_SEAL = 0x3abdc18;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function copyrightMark(year: number): string {
  if (fnv1a(`${CREDIT_OWNER}|${CREDIT_RIGHTS}|${CREDIT_START_YEAR}`) !== CREDIT_SEAL) {
    throw new Error('Copyright credit tampered with — refusing to render. Put it back. 🫷');
  }
  const range = year > CREDIT_START_YEAR ? `${CREDIT_START_YEAR}–${year}` : `${CREDIT_START_YEAR}`;
  return `© ${range} ${CREDIT_OWNER}. ${CREDIT_RIGHTS}`;
}

// --- Projects ---------------------------------------------------------------
// Copy + per-project accent live here; the hero VISUALS and their renderer stay
// in src/components/project-cards (they're JSX). `hero.kind` picks which visual.
// `accent` (space-separated RGB triplets) drives `--hero-accent` for the heroes
// that use it (cube, waves); the others ignore it.

export type ProjectHero =
  | { kind: 'waves' }
  | { kind: 'tour' }
  | { kind: 'carousel' }
  | { kind: 'cube' };

export interface ShowcaseProject {
  id: string;
  name: string;
  type: string;
  url: string;
  blurb: string;
  story: string[];
  tags: string[];
  stars: number | null;
  hero: ProjectHero;
  /** RGB triplets ("r g b") for `--hero-accent`, light + dark. */
  accent?: { light: string; dark: string };
}

export const projects: ShowcaseProject[] = [
  {
    id: 'cli-tools',
    name: 'Tools for Agents',
    type: 'CLI + MCP',
    url: 'https://github.com/bunizao?tab=repositories&q=cli',
    blurb: 'Small CLIs for the dull parts of being a student. Each one speaks MCP, so an agent can run it for you.',
    story: [
      "I kept doing the same chores by hand: pulling assignments off Moodle, reading Ed threads, syncing OnTrack tasks, signing in through Okta, marking attendance. So I wrote a CLI for each one. They do a single job and stay out of the way.",
      "Then I gave them an MCP server. Now an agent drives them while I'm doing something better with my afternoon.",
    ],
    tags: ['CLI', 'MCP', 'Automation'],
    stars: null,
    hero: { kind: 'cube' },
    accent: { light: '180 83 9', dark: '251 191 36' },
  },
  {
    id: 'ogis',
    name: 'ogis',
    type: 'OG Image Service',
    url: 'https://github.com/bunizao/ogis',
    blurb: 'Turn a title into a share image. Themed, signed, rendered at the edge.',
    story: [
      'Give ogis a title and a site name and it builds a clean Open Graph card on the edge. Pick a theme, sign the request so nobody hotlinks your generator, and every share gets its own image.',
      "The card you're looking at came out of ogis. That's the whole pitch.",
    ],
    tags: ['Next.js', 'OG Image', 'Edge'],
    stars: 5,
    hero: { kind: 'carousel' },
  },
  {
    id: 'attegi',
    name: 'Attegi',
    type: 'Ghost Theme',
    url: 'https://github.com/bunizao/Attegi',
    blurb: 'A Ghost theme with an editorial spine. Fast pages, a real table of contents, a dark mode that looks designed.',
    story: [
      "I set up my own Ghost blog and none of the themes fit, so I built Attegi. Sharp type, pages that load quick, a table of contents that tracks where you're reading, code blocks that leave you alone.",
      "27 blogs run it now. It's the theme I wanted on day one.",
    ],
    tags: ['Ghost', 'Theme', 'TailwindCSS'],
    stars: 27,
    hero: { kind: 'tour' },
  },
  {
    id: 'tutubetterrules',
    name: 'TutuBetterRules',
    type: 'Proxy Rules',
    url: 'https://github.com/bunizao/TutuBetterRules',
    blurb: 'Cross-platform proxy rules. Surge-first, syncs to Clash, Shadowrocket, and QX.',
    story: [
      'It started as my own Surge config, the kind you tweak at 1am until traffic finally routes the way you want. Then it grew into one source of truth that compiles out to Surge, Clash, Shadowrocket, and Quantumult X.',
      'About 400 people run it now. Modules, rewrites, and policy groups stay in sync, so you update once instead of babysitting four configs.',
    ],
    tags: ['Surge', 'Clash', 'Shadowrocket', 'QX'],
    stars: 391,
    hero: { kind: 'waves' },
    accent: { light: '13 148 136', dark: '45 212 191' },
  },
];
