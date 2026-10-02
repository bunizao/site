/* Number and label formatting shared by Home, Activity and Analytics. One
   place so "1,234", "64%" and "2m 13s" read the same on every screen. */

const COUNT = new Intl.NumberFormat('en');
const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCount(value: number): string {
  return Math.abs(value) >= 1_000_000 ? COMPACT.format(value) : COUNT.format(value);
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '–';
  const percent = ratio * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

/** 48s, 2m 13s, 1h 4m. Durations under a second read as 0s. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

let regions: Intl.DisplayNames | null = null;

/** ISO code to a name. site-api groups rows without geo under `unknown`. */
export function countryName(code: string | null): string {
  if (!code || code === 'unknown') return 'Unknown';
  try {
    regions ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regions.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const PLATFORMS: Record<string, string> = {
  wechat: 'WeChat',
  wechat_mini: 'WeChat mini program',
  weibo: 'Weibo',
  qq: 'QQ',
  dingtalk: 'DingTalk',
  edge: 'Edge',
  chrome: 'Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  other: 'Other',
  unknown: 'Unknown',
};

export function platformName(key: string | null): string {
  if (!key) return 'Unknown';
  return PLATFORMS[key] ?? key;
}

const SOURCES: Record<string, string> = {
  direct: 'Direct or unknown',
  telegram: 'Telegram',
  search: 'Search engines',
  twitter: 'X / Twitter',
  internal: 'Links on buxx.me',
  external: 'Other sites',
  unknown: 'Unknown',
};

export function sourceName(key: string | null): string {
  if (!key) return 'Unknown';
  return SOURCES[key] ?? key;
}

const UTC_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** `2026-09-22` (a UTC day, as site-api buckets) to "Tue 22 Sep". */
export function utcDayLabel(day: string): string {
  return UTC_DAY.format(new Date(`${day}T00:00:00Z`));
}

/** The last `count` UTC days ending today, oldest first, as `YYYY-MM-DD`. */
export function lastUtcDays(count: number, now = Date.now()): string[] {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) =>
    new Date(today.getTime() - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10));
}

// Formatters are built once: constructing one per row costs more than the
// formatting, and a log renders hundreds of rows.
const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** Local clock time for a log row: 14:32. */
export function clockTime(iso: string): string {
  return CLOCK.format(new Date(iso));
}

/** Local day for a log row older than today: 22 Sep. */
export function dayMonth(iso: string): string {
  return DAY_MONTH.format(new Date(iso));
}

/** Local day heading for a grouped log: Today, Yesterday, Mon 21 Sep. */
export function localDayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function localDayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
