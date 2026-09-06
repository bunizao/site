// The short date label the timeline instruments show: "Today", "Yesterday",
// then "Aug 30". Keys are the `data-date` of a feed group, YYYY-MM-DD, local.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseMoodDateKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMoodDateLabel(dateKey: string): string {
  const date = parseMoodDateKey(dateKey);
  if (!date) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
