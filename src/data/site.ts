// Single source of truth for site copy. Sections import their slice; seo.ts
// derives its identity strings from `profile` so the same fact is never typed
// twice. Plain typed module on purpose — Content Collections are for MD/MDX
// documents, not UI labels.
import type { ComponentType } from 'react';
import { FileText, Github, Mail, Send, Instagram, GraduationCap, type LucideIcon } from 'lucide-react';
import { OpenAIIcon, AnthropicIcon } from '@/components/icons';

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
  name: 'Lucian Tutu',
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

  // TODO(you): decide how the bio is modeled. See the note in chat — this is
  // the one real design call. The bio has inline emphasis:
  //   "Curious about <em>frontend design</em>, <em>proxy systems</em>, ..."
  // Pick a representation and add it here, e.g. a `bio: BioLine[]` shape where
  // each line is an array of `{ text, emphasis }` segments the component maps
  // over — or leave the bio JSX in Hero.astro and only centralize the rest.
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
