// The blog's writing ledger: how much has been written, and when. It closes the
// /blog index, under the posts.

/** Han, kana and hangul: each character is a word, the way 字 are counted. */
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/g;
/** Everything else counts in runs of letters and digits, the way words are. */
const LATIN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** Words in a post's plain text, counted as a reader of each script would. */
export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.replace(CJK, ' ').match(LATIN)?.length ?? 0;
  return cjk + rest;
}

export interface LedgerMonth {
  year: number;
  /** 1–12. */
  month: number;
  posts: number;
  words: number;
  /** 0–1: words against the busiest month, on a square root. */
  height: number;
  /** What was published that month, oldest first. */
  items: { title: string; slug: string }[];
}

export interface WritingLedger {
  posts: number;
  words: number;
  /** The year of the first post. */
  since: number;
  /** Oldest first, every month from January of `since` to `now`. */
  months: LedgerMonth[];
}

interface LedgerPost {
  title: string;
  slug: string;
  publishedAt: string;
  plaintext: string;
}

/** Months are UTC, like the year groups on the index. */
export function writingLedger(posts: LedgerPost[], now = new Date()): WritingLedger | null {
  const dated = posts
    .map((post) => ({
      at: new Date(post.publishedAt),
      words: countWords(post.plaintext ?? ''),
      item: { title: post.title, slug: post.slug },
    }))
    .filter((post) => Number.isFinite(post.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (dated.length === 0) return null;

  const tally = new Map<string, { words: number; items: LedgerMonth['items'] }>();
  for (const { at, words, item } of dated) {
    const key = `${at.getUTCFullYear()}-${at.getUTCMonth() + 1}`;
    const month = tally.get(key) ?? { words: 0, items: [] };
    month.words += words;
    month.items.push(item);
    tally.set(key, month);
  }

  const busiest = Math.max(...[...tally.values()].map((month) => month.words));
  const since = Math.min(...dated.map(({ at }) => at.getUTCFullYear()));
  // A post dated ahead of `now` still gets its month.
  const last = Math.max(now.getTime(), ...dated.map(({ at }) => at.getTime()));
  const lastYear = new Date(last).getUTCFullYear();
  const lastMonth = new Date(last).getUTCMonth() + 1;

  const months: LedgerMonth[] = [];
  for (let year = since; year <= lastYear; year++) {
    for (let month = 1; month <= (year === lastYear ? lastMonth : 12); month++) {
      const { words = 0, items = [] } = tally.get(`${year}-${month}`) ?? {};
      // Square root, so one long essay does not flatten every other month.
      const height = busiest > 0 ? Math.sqrt(words / busiest) : 0;
      months.push({ year, month, posts: items.length, words, height, items });
    }
  }

  return {
    posts: dated.length,
    words: dated.reduce((sum, post) => sum + post.words, 0),
    since,
    months,
  };
}

/** A word count as each locale says it: 3.4 万字 or 607 字, 34,120 words. */
export function formatWords(words: number, locale: 'zh' | 'en'): string {
  if (locale === 'en') return `${words.toLocaleString('en-US')} ${words === 1 ? 'word' : 'words'}`;
  if (words >= 10_000) return `${(words / 10_000).toFixed(1).replace(/\.0$/, '')} 万字`;
  return `${words.toLocaleString('zh-CN')} 字`;
}
