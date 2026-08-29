// Single source of truth for site copy. Sections import their slice; seo.ts
// derives its identity strings from `profile` so the same fact is never typed
// twice. Plain typed module on purpose — Content Collections are for MD/MDX
// documents, not UI labels.
import type { ComponentType } from 'react';
import { FileText, Mail, Send, GraduationCap } from 'lucide-react';
import { OpenAIIcon, AnthropicIcon, GitHubIcon, InstagramIcon } from '@/components/icons';

// --- Identity ---------------------------------------------------------------
// The canonical "who I am" facts. seo.ts reads name/jobTitle/knowsAbout/links
// from here instead of re-declaring them.

export interface ProfileLink {
  /** Display name, also used as the social chip label. */
  name: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
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
  penNames: ['Murray'],
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
    { name: 'Blog', url: 'https://buxx.me/blog', icon: FileText, description: 'Read my articles', handle: 'buxx.me/blog', sameAs: true },
    { name: 'GitHub', url: 'https://tuu.cat/gh', icon: GitHubIcon, description: 'Check out my code', handle: '@bunizao', sameAs: true, canonicalUrl: 'https://github.com/bunizao' },
    { name: 'Email', url: 'mailto:me@buxx.me', icon: Mail, description: 'Send me a message', handle: 'me@buxx.me' },
    { name: 'Telegram', url: 'https://tuu.cat/tg', icon: Send, description: 'Chat with me', handle: 'tuu.cat/tg', sameAs: true },
    { name: 'Instagram', url: 'https://tuu.cat/ig', icon: InstagramIcon, description: 'See my photos', handle: 'tuu.cat/ig', sameAs: true },
  ] satisfies ProfileLink[],
} as const;

// --- Site meta --------------------------------------------------------------
// Site-level identity strings: page titles, og:site_name, and the default
// OG/meta description. seo.ts and Layout.astro read these instead of inlining.

export const meta = {
  siteName: 'buxx.me',
  siteUrl: 'https://buxx.me',
  homeTitle: `${profile.name} — Student, Developer & Blogger`,
  // Default OG / meta description used on the home page and as the fallback.
  description:
    `Build and then polish. Ship and then reflect. Write, shoot, and think in between. I'm ${profile.name}.`,
};

// Contact channels shown in the blog masthead "联系" widget. It mirrors the
// home page "Find me at" row minus the Blog link (you're already reading it),
// so editing `profile.links` above is all it takes to add, drop, or relabel a
// channel here.
export const contactLinks = profile.links.filter((link) => link.name !== 'Blog');

// --- Blog identity ----------------------------------------------------------
// The blog is its own publication — 無人之境 — with a name, mark, and voice
// deliberately distinct from the personal homepage above. The thinking-woman
// mark is the publication's icon; the author (avatar + name) recedes to a
// byline that links back to the main site. Locale strategy and locale copy live
// together so each surface chooses a language without scattering ad hoc fields.

export type BlogLocale = 'zh' | 'en';

export interface BlogLocaleCopy {
  name: string;
  tagline: string;
  aiCredit: {
    /**
     * Shown for models credited without a hand-written `note`. `{models}` is
     * replaced by the credited model names, joined for this locale.
     */
    fallback: string;
  };
  subscribe: SubscribeCopy;
  share: ShareCopy;
}

/**
 * Every word the subscribe panel says. It serves two surfaces from one
 * component, so the stream names and the two intro tails both live here rather
 * than as ternaries in the template.
 *
 * The panel renders all of this server-side; the outcome strings its client
 * controller writes after a submit ride to the browser as `data-*` attributes
 * on the panel root. Nothing under `blog.copy` is ever imported
 * into a client bundle — site.ts would drag the whole site config with it.
 */
export interface SubscribeCopy {
  trigger: string;
  title: string;
  close: string;
  emailPlaceholder: string;
  /** "欢迎订阅 <name>，…" — the name is the stream, set apart by colour. */
  introLead: string;
  blogTail: string;
  moodName: string;
  moodTail: string;
  streamsLabel: string;
  posts: { title: string; meta: string };
  moods: { title: string; meta: string };
  freqLabel: string;
  freq: { instant: string; every5h: string; daily: string };
  privacy: { prefix: string; link: string; suffix: string };
  rss: string;
  telegram: string;
  submit: string;
  done: string;
  retry: string;
  /* Outcomes the controller writes. */
  success: string;
  already: string;
  errorGeneric: string;
  invalidEmail: string;
  needChannel: string;
  rateLimited: string;
  network: string;
  verifyFailed: string;
}

export interface ShareCopy {
  copyLink: string;
  copied: string;
  /** Screen-reader form of `copied` — a label has to say what was copied. */
  linkCopied: string;
  share: string;
}

export const blog = {
  locale: {
    default: 'zh',
    home: 'en',
    blog: 'zh',
  } satisfies Record<'default' | 'home' | 'blog', BlogLocale>,
  copy: {
    zh: {
      name: '無人之境',
      tagline: '生长于共鸣、独白、文学、与沉默之间。',
      aiCredit: {
        fallback: '本文在 {models} 的协助下完成。',
      },
      subscribe: {
        trigger: '订阅',
        title: '订阅',
        close: '关闭',
        emailPlaceholder: '留个邮箱',
        introLead: '欢迎订阅',
        blogTail: '，感谢您读到这里。',
        moodName: '闲谈手记',
        moodTail: '，第一时间收到更新。',
        streamsLabel: '订阅内容',
        posts: { title: '文章', meta: '更新即推送' },
        moods: { title: '闲谈', meta: '按下方频率推送' },
        freqLabel: '闲谈推送频率',
        freq: { instant: '即时', every5h: '每 5 时', daily: '每日' },
        privacy: { prefix: '订阅信息受', link: '隐私政策', suffix: '保护。' },
        rss: '通过 RSS 订阅',
        telegram: '订阅 Telegram 频道',
        submit: '订阅',
        done: '好',
        retry: '重试',
        success: '确认邮件已发，去收件箱点一下。',
        already: '已经订阅过了。',
        errorGeneric: '出错了，稍后重试。',
        invalidEmail: '这个邮箱看起来不太对。',
        needChannel: '至少选一样。',
        rateLimited: '太频繁了，稍后再试。',
        network: '网络不太好，检查下连接。',
        verifyFailed: '校验失败，重试一下。',
      },
      share: {
        copyLink: '复制链接',
        copied: '已复制',
        linkCopied: '链接已复制',
        share: '分享',
      },
    },
    en: {
      name: 'Sillage',
      tagline: 'Grown between resonance, monologue, literature, and silence.',
      aiCredit: {
        fallback: 'Written with {models}.',
      },
      subscribe: {
        trigger: 'Subscribe',
        title: 'Subscribe',
        close: 'Close',
        emailPlaceholder: 'Your email',
        introLead: 'Subscribe to',
        blogTail: ' — thanks for reading this far.',
        moodName: 'Moods',
        moodTail: ' — updates as they land.',
        streamsLabel: 'What to send',
        posts: { title: 'Posts', meta: 'Sent on publish' },
        moods: { title: 'Moods', meta: 'Sent at the rate below' },
        freqLabel: 'Mood delivery rate',
        freq: { instant: 'Instant', every5h: 'Every 5h', daily: 'Daily' },
        privacy: { prefix: 'Handled under the', link: 'privacy policy', suffix: '.' },
        rss: 'Subscribe by RSS',
        telegram: 'Follow on Telegram',
        submit: 'Subscribe',
        done: 'Done',
        retry: 'Retry',
        success: 'Confirmation sent — tap the link in your inbox.',
        already: "You're already subscribed.",
        errorGeneric: 'Something broke. Try again in a moment.',
        invalidEmail: "That email doesn't look right.",
        needChannel: 'Pick at least one.',
        rateLimited: 'Too many tries. Give it a minute.',
        network: 'Network trouble — check your connection.',
        verifyFailed: 'That check failed. Try again.',
      },
      share: {
        copyLink: 'Copy link',
        copied: 'Copied',
        linkCopied: 'Link copied',
        share: 'Share',
      },
    },
  } satisfies Record<BlogLocale, BlogLocaleCopy>,
  /** Canonical publication name. Surfaces may opt into `copy[locale].name`. */
  name: '無人之境',
  /** Publication mark (thinking-woman line art). Drop the asset at this path. */
  mark: '/blog-mark.webp',
  /** RSS feed for reader-app subscribers. Self-hosted so it does not bounce through the legacy Ghost subdomain. */
  feed: '/blog/rss.xml',
  /** Byline: the author behind the publication, linking home to the main site. */
  author: {
    name: profile.name,
    avatar: '/avatar.webp',
    home: meta.siteUrl,
  },
  /**
   * The publication colophon rendered in the blog landing page footer.
   * Both locale variants stay here so the copy follows the existing home/blog
   * locale split. `**...**` marks an emphasized phrase.
   */
  sillage: {
    body: {
      en: [
        '**Sillage** is the wake a ship leaves as it cuts through the sea. The ship drifts alone across the vast ocean, leaving only a fragile trail of waves that slowly spread out, and then vanish.',
        'I often write in Chinese, and **無人之境** was the name I gave this blog at the very start — a place with no one on it. Here, nobody passes through. Nobody leaves footprints. And because no one does, the trace stands out more clearly: like the only footprint in snow, like the one light still burning deep in the night. I think of this place as an untouched wilderness, and every piece of writing I leave behind becomes the **sillage** of my passage through it — proof that I was once here, and what I choose to leave behind after I am gone.',
        'This website is the **sillage** I leave in the vast ocean of the internet.',
      ],
      zh: [
        'Sillage 是船划过海面后留下的那道痕迹。船孤独地漂泊在茫茫大海上，只留下一道脆弱的浪，慢慢散开，然后消散。',
        '我常常用中文写作，而無人之境是在最开始给我 blog 取的中文名字。在这里，没有谁会经过，没有谁会留下脚印，可正因为无人，那道痕迹才显得格外清晰，仿若雪地里唯一的足迹，是深夜里独自点亮的灯。我把这里当作一片无人到访的荒原，而落下的每一笔文字，则成为我穿行其间时留下的 sillage——对以后来讲，这就是我曾经在场的证明，也是我离开后仍愿意留下的东西。',
        '这个网站便是我在互联网这片大海所留下的 sillage。',
      ],
    } satisfies Record<BlogLocale, string[]>,
  },
} as const;

// --- Blog palette (墨色) -----------------------------------------------------
// Single source of truth for the blog's accent system. BlogLayout emits these
// as CSS custom properties scoped to .blog-zone; blog.css and the feature
// components consume them by name. Greys are deliberately NOT here — they derive
// from --foreground at low alpha in blog.css, which yields both light and dark
// for free.
//
// 無人之境 is ink-wash country, so the accents are inks, not a UI palette. The
// whole set is ONE hue — blue — graded by depth and saturation, because a
// monochrome publication should read as a single voice, not a swatch book. Each
// shade still owns exactly ONE job, and the job is fixed by WCAG contrast
// against the page surface — light sits on #fff, dark sits on #0a0a0a
// (near-black, never #000: pure black smears on OLED and white text on it hits
// 21:1, which haloes in long-form reading):
//
//   dai 黛 — primary.   Links, TOC progress, focus.   text-safe (6.8:1 / 8.0:1)
//   dian 靛 — the mark.  NotByAI pledge, byline.       text-safe (10.3:1 / 8.2:1)
//   ji 霁 — highlight.   <mark>, selection. FILL ONLY  (3.6:1 fails AA as text)
//
// dai (远山黛) is the greyed slate-blue shanshui painters dilute to push a ridge
// into the haze — "visible but unreachable" is the whole publication. dian (靛青)
// is the concentrated dye, a deep saturated indigo; it sits below dai so the
// author's mark reads as the firmest blue on the page. ji (雨过天青) is the pale
// sky after rain, used only as a wash behind found text. Edit a hex here and
// every surface follows.

export interface BlogInk {
  /** On the light surface (#fff). */
  light: string;
  /** On the near-black dark surface (#0a0a0a). */
  dark: string;
  /** The single scenario this ink owns. */
  role: 'primary' | 'mark' | 'highlight';
}

export const blogPalette = {
  dai: { light: '#3C5D80', dark: '#7FA8D6', role: 'primary' },
  /* Unspent since the "Not by AI" pledge was removed -- see docs/surfaces/blog.md. */
  dian: { light: '#27406E', dark: '#6FA8FF', role: 'mark' },
  ji: { light: '#3E8BD8', dark: '#6FB2F2', role: 'highlight' },
} as const satisfies Record<string, BlogInk>;

// --- Authors ----------------------------------------------------------------
// Bylines for the publication (and any future multi-author posts). The avatar
// reuses the site avatar; `manifesto` is the author's own note on how they
// write, which wants a page of its own -- it used to be a hover card at the
// foot of every article, hiding one sentence behind a popover.

export interface Author {
  name: string;
  avatar: string;
  /** Authored per locale; `**...**` marks an emphasized phrase (bold + full-ink). */
  manifesto: Record<BlogLocale, string>;
}

export const authors: Record<string, Author> = {
  murray: {
    name: 'Murray',
    avatar: '/avatar.webp',
    manifesto: {
      en: "**I write what I think.** Stripped of the friction of human deliberation, the smooth text produced by AI is essentially an average derived from the writing of countless others. It can mimic anyone's voice precisely because **that voice belongs to no one**. **I refuse to let my work be dragged toward that mediocre average.** I hold to my own style, to the labor of revision, to the thinking that goes into every sentence. **I am writing my own history**, carving the trace of a life onto the internet. That is the final reason I won't let AI write for me.",
      zh: '心有所想，笔有所书。',
    },
  },
};

export const defaultAuthorId = 'murray';

// --- Hero -------------------------------------------------------------------

export const hero = {
  typewriterNames: [profile.name, ...profile.alternateNames],
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

// --- Primary navigation -----------------------------------------------------
// Real, site-wide page links. Rendered in two places: the desktop home sidebar
// and the mobile menu sheet (see Layout.astro). `section` maps a link to a
// homepage section id so the desktop sidebar can highlight it via scroll-spy
// while still navigating to the real page; links without one (e.g. Components)
// simply never highlight on the home page.

export interface NavLink {
  label: string;
  href: string;
  section?: string;
}

export const navLinks: NavLink[] = [
  { label: 'Projects', href: '/projects', section: 'projects' },
  { label: 'Blog', href: '/blog', section: 'writing' },
  { label: 'Moods', href: '/mood', section: 'moods' },
  { label: 'Components', href: '/components' },
  { label: 'Docs', href: '/docs' },
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
