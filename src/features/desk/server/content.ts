// What the desk shows at request time: the newest few moods and the channel
// they come from, the newest posts for the contents page and what the blog
// adds up to, and the repositories pushed to lately. Everything else on the
// desk is static data from site.ts.
//
// Two of these are made up until site-api serves them (plans/desk-backend.md):
// the reads on the blog and the repositories pushed to. Both are marked MOCK
// below.
import type { MoodFeedItem } from '@/features/mood/server/contracts';
import { loadMoodFeed } from '@/features/mood/server/api-client';
import type { MoodServerContext } from '@/features/mood/server/channel-service';
import { buildArchiveSrcSet } from '@/features/mood/shared/image-srcset';
import { writingLedger } from '@/features/posts/ledger';
import { getListedPosts } from '@/features/posts/server/content';
import { postPath } from '@/features/posts/format';

export interface DeskMood {
  id: string;
  href: string;
  text: string;
  /** "zh" when the text is Chinese, so assistive tech picks the right voice. */
  lang?: string;
  datetime: string;
  /** "21:51", in Melbourne time, where every one of these was posted; the
      page puts it in the reader's own time (client/moods.ts). */
  time: string;
  thumb?: { src: string; srcset?: string };
  /** The two biggest, as "❤️ 3". */
  reactions: string[];
}

export interface DeskPost {
  href: string;
  title: string;
  lang?: string;
  /** "Sep 2026". */
  date: string;
}

export interface DeskWriting {
  posts: number;
  words: number;
  /** The year of the first post. */
  since: number;
  /** Every reader of every post, all time. */
  reads: number;
  /** The post read the most. */
  top?: { title: string; href: string; lang?: string };
}

export interface DeskRepo {
  name: string;
  href: string;
  /** "2 days ago". */
  when: string;
}

export interface DeskChannel {
  /** "Levitating". */
  title: string;
  avatar?: string;
}

export interface DeskContent {
  /** Oldest first, so the newest sits at the bottom like a chat. */
  moods: DeskMood[];
  channel: DeskChannel;
  posts: DeskPost[];
  postCount: number;
  writing: DeskWriting | null;
  repos: DeskRepo[];
}

const MOODS = 3;
const POSTS = 5;

const melbourneTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false });
const monthYear = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', month: 'short', year: 'numeric' });

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "yesterday", "3 days ago", "last week", "2 weeks ago". */
const ago = (days: number) => (days < 7 ? relative.format(-days, 'day') : relative.format(-Math.round(days / 7), 'week'));

// MOCK until GET /api/v2/writing/stats (plans/desk-backend.md): reads per
// post, made up from the slug so they hold still between visits.
const mockReads = (slug: string) => {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return 80 + (Math.abs(hash) % 2400);
};

// MOCK until GET /api/v2/github/activity (plans/desk-backend.md): public
// repositories from the projects list, pushed to some days ago.
const MOCK_REPOS: { name: string; days: number }[] = [
  { name: 'ogis', days: 1 },
  { name: 'Attegi', days: 4 },
  { name: 'TutuBetterRules', days: 12 },
];

const format = (formatter: Intl.DateTimeFormat, iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : formatter.format(date);
};

// Channel housekeeping is not a mood.
const isMood = (item: MoodFeedItem) => {
  const text = item.previewText.trim();
  return (text || item.image) && text !== 'Channel photo updated';
};

// Moods and post titles are mostly Chinese on an English page; one Han
// character is enough to pick the voice.
const langOf = (text: string) => (/\p{Script=Han}/u.test(text) ? 'zh' : undefined);

const toMood = (item: MoodFeedItem): DeskMood => {
  const thumb = item.image && item.imageKind !== 'sticker' ? buildArchiveSrcSet(item.image, { widths: [96, 160] }) : null;
  return {
    id: item.id,
    href: `/mood/${item.id}`,
    text: item.previewText.trim(),
    lang: langOf(item.previewText),
    datetime: item.datetime,
    time: format(melbourneTime, item.datetime),
    ...(thumb ? { thumb: { src: thumb.src, srcset: thumb.srcset } } : {}),
    reactions: [...item.reactions]
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 2)
      .map((reaction) => `${reaction.emoji} ${reaction.count}`),
  };
};

type ListedPost = Awaited<ReturnType<typeof getListedPosts>>[number];

const summarise = (posts: ListedPost[]): DeskWriting | null => {
  const ledger = writingLedger(posts);
  if (!ledger) return null;
  const read = posts.map((post) => ({ post, reads: mockReads(post.slug) }));
  const top = read.reduce((a, b) => (b.reads > a.reads ? b : a)).post;
  return {
    posts: ledger.posts,
    words: ledger.words,
    since: ledger.since,
    reads: read.reduce((sum, { reads }) => sum + reads, 0),
    top: { title: top.title, href: postPath(top.slug), lang: langOf(top.title) },
  };
};

export async function loadDeskContent(context: MoodServerContext): Promise<DeskContent> {
  // Either source failing leaves its object empty; the rest of the desk stands.
  const [feed, posts] = await Promise.all([
    loadMoodFeed(context, { limit: 12 }).catch(() => null),
    getListedPosts().catch(() => []),
  ]);
  return {
    moods: (feed?.posts ?? []).filter(isMood).slice(0, MOODS).map(toMood).reverse(),
    channel: {
      title: feed?.channel?.title?.trim() || 'Levitating',
      ...(feed?.channel?.avatar ? { avatar: feed.channel.avatar } : {}),
    },
    posts: posts.slice(0, POSTS).map((post) => ({
      href: postPath(post.slug),
      title: post.title,
      lang: langOf(post.title),
      date: format(monthYear, post.publishedAt),
    })),
    postCount: posts.length,
    writing: summarise(posts),
    repos: MOCK_REPOS.map(({ name, days }) => ({ name, href: `https://github.com/bunizao/${name}`, when: ago(days) })),
  };
}
