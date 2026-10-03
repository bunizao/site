// The moods on the desk, dated the way the mood feed dates them: the time in
// each bubble and a day over the first of each day ("Today", "Yesterday",
// "October 1"), both in the reader's own time. The server can only give
// Melbourne's; the panel is out of sight until it opens, so nothing moves.
import { formatMoodDateHeader, formatMoodDateKey, formatMoodTime } from '@/features/mood/shared/date-grouping';

export function dateMoods(root: ParentNode = document) {
  root.querySelectorAll('.mc-day').forEach((day) => day.remove());
  let last = '';
  root.querySelectorAll<HTMLTimeElement>('.mc-bubble .mc-time').forEach((time) => {
    const key = formatMoodDateKey(time.dateTime);
    if (!key) return;
    time.textContent = formatMoodTime(time.dateTime);
    if (key === last) return;
    last = key;
    const day = document.createElement('span');
    day.className = 'mc-day';
    day.textContent = formatMoodDateHeader(key);
    time.closest('.mc-bubble')?.before(day);
  });
}

export function initMoods() {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const panel = document.querySelector<HTMLElement>('[data-panel="moods"]');
  if (!easel || !panel) return;
  dateMoods(panel);
  // "Today" turns into "Yesterday" at midnight; a tab left open is dated
  // again each time the moods come back on the canvas.
  easel.addEventListener('easel:shown', (event) => {
    if ((event as CustomEvent<string>).detail === 'moods') dateMoods(panel);
  });
}
