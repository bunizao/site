// Shared mood date/time formatting. SSR runs on Cloudflare Workers where `Date`
// getters resolve to UTC; the client runs in the visitor's local timezone. Both
// paths call these helpers, so the only difference is the ambient timezone.
// The inline script in src/features/mood/client/rekey-server-groups-inline.js
// regroups the SSR feed into local days before first paint.
//
// That script cannot import modules, so it carries its own copy of these
// formatters. Client appends find their group by `data-date`, so both copies
// must agree; the mood-date-grouping unit test checks the inline output
// against these functions.

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatMoodTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatMoodDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMoodDateHeader(dateKey: string, now: Date = new Date()): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  const isSameDay = (candidate: Date, target: Date): boolean => (
    candidate.getFullYear() === target.getFullYear()
    && candidate.getMonth() === target.getMonth()
    && candidate.getDate() === target.getDate()
  );

  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  if (date.getFullYear() === now.getFullYear()) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  }

  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
