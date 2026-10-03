// What the desk shows at request time: the newest few moods and the channel
// they come from, and the newest posts for the contents page. Everything else
// on the desk is static data from site.ts.
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
}

const MOODS = 3;
const POSTS = 5;

const melbourneTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false });
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
    time: format(melbourneTime, item.datetime),
    ...(thumb ? { thumb: { src: thumb.src, srcset: thumb.srcset } } : {}),
    reactions: [...item.reactions]
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 2)
      .map((reaction) => `${reaction.emoji} ${reaction.count}`),
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
  };
}
