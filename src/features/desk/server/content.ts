// What the desk shows at request time: the newest few moods and the channel
// they come from, the newest posts for the contents page and what the blog
// adds up to, and the week on GitHub (server/github.ts). Everything else on
// the desk is static data from site.ts.
import type { BlogStats } from '@bunizao/contracts/content';
import type { MoodFeedItem } from '@/features/mood/server/contracts';
import { loadMoodFeed } from '@/features/mood/server/api-client';
import type { MoodServerContext } from '@/features/mood/server/channel-service';
import { buildArchiveSrcSet } from '@/features/mood/shared/image-srcset';
import { loadGitHubWeek, type DeskGitHubWeek } from '@/features/desk/server/github';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import { writingLedger } from '@/features/posts/ledger';
import { getListedPosts } from '@/features/posts/server/content';
import { postPath } from '@/features/posts/format';
import { proxyApiRequest } from '@/lib/http/api-service-proxy';

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
  /** Reads of every post since the counting began ("June 2026"). Nothing
      before it was kept, so the figure never claims more than that. */
  reads?: { count: number; since: string };
  /** The post read the most. */
  top?: { title: string; href: string; lang?: string };
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
  github: DeskGitHubWeek | null;
}

const MOODS = 3;
const POSTS = 5;

const melbourneTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false });
const monthYear = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', month: 'short', year: 'numeric' });
const longMonthYear = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Melbourne', month: 'long', year: 'numeric' });

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

export const summariseDeskWriting = (posts: ListedPost[], stats: BlogStats | null): DeskWriting | null => {
  const ledger = writingLedger(posts);
  if (!ledger) return null;
  const since = stats?.since ? format(longMonthYear, stats.since) : '';
  const counts = new Map(stats?.posts.map((post) => [post.slug, post.reads]));
  const top = posts.filter((post) => (counts.get(post.slug) ?? 0) > 0)
    .sort((a, b) => (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0))[0];
  return {
    posts: ledger.posts,
    words: ledger.words,
    since: ledger.since,
    ...(since && stats ? { reads: { count: stats.totals.reads, since } } : {}),
    ...(since && top ? { top: { title: top.title, href: postPath(top.slug), lang: langOf(top.title) } } : {}),
  };
};

export async function loadDeskBlogStats(context: MoodServerContext): Promise<BlogStats | null> {
  if (isE2ESiteFixtureEnabled(context.locals)) return null;
  try {
    const url = new URL('/api/v2/blog/stats', context.request.url);
    const response = await proxyApiRequest(new Request(url), context.locals);
    if (!response.ok) return null;
    const stats = await response.json() as BlogStats;
    if (!stats || !Array.isArray(stats.posts) || !Number.isFinite(stats.totals?.reads)
      || stats.totals.reads < 0 || (stats.since !== null && typeof stats.since !== 'string')
      || stats.posts.some((post) => !post || typeof post.slug !== 'string'
        || !Number.isFinite(post.reads) || post.reads < 0)) return null;
    return stats;
  } catch {
    return null;
  }
}

export async function loadDeskContent(context: MoodServerContext): Promise<DeskContent> {
  // Any source failing leaves its object empty; the rest of the desk stands.
  const [feed, posts, github, stats] = await Promise.all([
    loadMoodFeed(context, { limit: 12 }).catch(() => null),
    getListedPosts().catch(() => []),
    isE2ESiteFixtureEnabled(context.locals) ? null : loadGitHubWeek(),
    loadDeskBlogStats(context),
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
    writing: summariseDeskWriting(posts, stats),
    github,
  };
}
