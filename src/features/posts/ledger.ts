// The blog's writing ledger: how much has been written, and when. Shown at the
// foot of the /blog index and the head of /blog/archive, so the short index
// hands over to the full list through the same picture instead of a cut.

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
  /** 1–12. */
  month: number;
  posts: number;
  words: number;
  /** 0 for nothing written, then 1–4 by words against the busiest month. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Not yet come. */
  ahead: boolean;
}

export interface LedgerYear {
  year: number;
  months: LedgerMonth[];
}

export interface WritingLedger {
  posts: number;
  words: number;
  /** The year of the first post. */
  since: number;
  /** Newest year first, every year from the first post to `now`. */
  years: LedgerYear[];
}

interface LedgerPost {
  publishedAt: string;
  plaintext: string;
}

/** Months are UTC, like the year groups on the index. */
export function writingLedger(posts: LedgerPost[], now = new Date()): WritingLedger | null {
  const dated = posts
    .map((post) => ({ at: new Date(post.publishedAt), words: countWords(post.plaintext ?? '') }))
    .filter((post) => Number.isFinite(post.at.getTime()));
  if (dated.length === 0) return null;

  const tally = new Map<string, { posts: number; words: number }>();
  for (const { at, words } of dated) {
    const key = `${at.getUTCFullYear()}-${at.getUTCMonth() + 1}`;
    const month = tally.get(key) ?? { posts: 0, words: 0 };
    month.posts += 1;
    month.words += words;
    tally.set(key, month);
  }

  const busiest = Math.max(...[...tally.values()].map((month) => month.words));
  // Square root, so one long essay does not wash every other month out.
  const levelOf = (words: number): LedgerMonth['level'] =>
    words <= 0 || busiest <= 0 ? 0 : (Math.max(1, Math.ceil(4 * Math.sqrt(words / busiest))) as LedgerMonth['level']);

  const since = Math.min(...dated.map(({ at }) => at.getUTCFullYear()));
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;
  const years: LedgerYear[] = [];
  for (let year = Math.max(thisYear, since); year >= since; year--) {
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const { posts = 0, words = 0 } = tally.get(`${year}-${month}`) ?? {};
      return { month, posts, words, level: levelOf(words), ahead: year === thisYear && month > thisMonth };
    });
    years.push({ year, months });
  }

  return {
    posts: dated.length,
    words: dated.reduce((sum, post) => sum + post.words, 0),
    since,
    years,
  };
}

/** A word count as each locale writes it: 12.3 万 in Chinese, 123,456 in English. */
export function formatWords(words: number, locale: 'zh' | 'en'): string {
  if (locale === 'zh' && words >= 10_000) return `${(words / 10_000).toFixed(1).replace(/\.0$/, '')} 万`;
  return words.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
}
