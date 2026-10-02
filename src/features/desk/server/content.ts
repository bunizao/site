// What the desk shows at request time: the newest few moods for the channel,
// and the newest posts for the contents page. Everything else on the desk is
// static data from site.ts.
import type { MoodFeedItem } from '@/features/mood/server/contracts';
import { loadMoodFeed } from '@/features/mood/server/api-client';
import type { MoodServerContext } from '@/features/mood/server/channel-service';
import { buildArchiveSrcSet } from '@/features/mood/shared/image-srcset';
import { getListedPosts } from '@/features/posts/server/content';
import { postPath } from '@/features/posts/format';

export interface DeskMood {
  id: string;
  href: string;
  text: string;
  /** "zh" when the text is Chinese, so assistive tech picks the right voice. */
  lang?: string;
  datetime: string;
  /** "1 Oct", in Melbourne time, where every one of these was posted. */
  date: string;
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

export interface DeskContent {
  /** Oldest first, so the newest sits at the bottom like a chat. */
  moods: DeskMood[];
  posts: DeskPost[];
  postCount: number;
}

const MOODS = 3;
const POSTS = 5;

const melbourneDay = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short' });
const monthYear = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', month: 'short', year: 'numeric' });

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
    date: format(melbourneDay, item.datetime),
    ...(thumb ? { thumb: { src: thumb.src, srcset: thumb.srcset } } : {}),
    reactions: [...item.reactions]
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 2)
      .map((reaction) => `${reaction.emoji} ${reaction.count}`),
  };
};

export async function loadDeskContent(context: MoodServerContext): Promise<DeskContent> {
  // Either source failing leaves its object empty; the rest of the desk stands.
  const [moods, posts] = await Promise.all([
    loadMoodFeed(context, { limit: 12 }).then((feed) => feed.posts).catch(() => []),
    getListedPosts().catch(() => []),
  ]);
  return {
    moods: moods.filter(isMood).slice(0, MOODS).map(toMood).reverse(),
    posts: posts.slice(0, POSTS).map((post) => ({
      href: postPath(post.slug),
      title: post.title,
      lang: langOf(post.title),
      date: format(monthYear, post.publishedAt),
    })),
    postCount: posts.length,
  };
}
