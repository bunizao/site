// Shared mood date/time formatting. SSR runs on Cloudflare Workers where `Date`
// getters resolve to UTC; the client runs in the visitor's local timezone. Both
// paths call these helpers, so the only difference is the ambient timezone. The
// rekey pass below reconciles the two after hydration.
//
// KEEP IN SYNC with the pre-paint copy in
// src/features/mood/client/rekey-server-groups-inline.js; the
// mood-date-grouping unit test compares both implementations.

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

interface RekeyOptions {
  now?: Date;
}

function createMoodDateGroup(
  ownerDocument: Document,
  dateKey: string,
  now: Date,
): { group: HTMLElement; items: HTMLElement } {
  const group = ownerDocument.createElement('div');
  group.className = 'mood-date-group';
  group.dataset.date = dateKey;

  const header = ownerDocument.createElement('div');
  header.className = 'mood-date-header';

  const dateText = ownerDocument.createElement('span');
  dateText.className = 'mood-date-text';
  dateText.textContent = formatMoodDateHeader(dateKey, now);

  const dateLine = ownerDocument.createElement('div');
  dateLine.className = 'mood-date-line';

  header.appendChild(dateText);
  header.appendChild(dateLine);

  const items = ownerDocument.createElement('div');
  items.className = 'mood-date-items';

  group.appendChild(header);
  group.appendChild(items);
  return { group, items };
}

/**
 * Recompute SSR-rendered date groups in the visitor's local timezone.
 *
 * The server groups posts by their UTC calendar day; a visitor in another
 * timezone sees different day boundaries, so a single UTC group can split
 * across a local midnight (and per-post times must shift). This walks every
 * rendered `.mood-item` in order, rewrites its `<time>` text to local time,
 * and regroups the items under local `data-date` keys so later client appends
 * merge into the same groups. It moves live nodes only; post internals are
 * never re-rendered. Idempotent: for a UTC visitor it is a no-op.
 */
export function rekeyMoodServerRenderedGroups(list: HTMLElement, options: RekeyOptions = {}): void {
  const now = options.now ?? new Date();
  const ownerDocument = list.ownerDocument;
  if (!ownerDocument) return;

  const existingGroups = Array.from(list.querySelectorAll<HTMLElement>('.mood-date-group'));
  if (existingGroups.length === 0) return;

  const orderedItems: HTMLElement[] = [];
  existingGroups.forEach((group) => {
    group.querySelectorAll<HTMLElement>('.mood-date-items > .mood-item').forEach((item) => {
      orderedItems.push(item);
    });
  });

  if (orderedItems.length === 0) return;

  // Rewrite every rendered time to local and collect each item's local key.
  const runs: Array<{ key: string; items: HTMLElement[] }> = [];
  orderedItems.forEach((item) => {
    const keySource = item.querySelector<HTMLTimeElement>('.mood-item-time')
      ?? item.querySelector<HTMLTimeElement>('time[datetime]');
    const datetime = keySource?.getAttribute('datetime') ?? '';
    const key = formatMoodDateKey(datetime);
    if (!key) return;

    item.querySelectorAll<HTMLTimeElement>('time[datetime]').forEach((timeEl) => {
      const localTime = formatMoodTime(timeEl.getAttribute('datetime') ?? '');
      if (localTime) timeEl.textContent = localTime;
    });

    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun.key === key) {
      lastRun.items.push(item);
    } else {
      runs.push({ key, items: [item] });
    }
  });

  if (runs.length === 0) return;

  // Reuse the existing group shells for the first runs, minting new ones only
  // when the local timezone produced more groups than the server rendered.
  const anchor = existingGroups[0];
  const parent = anchor.parentNode;
  if (!parent) return;

  runs.forEach((run, index) => {
    let group = existingGroups[index] ?? null;
    let items: HTMLElement | null = group?.querySelector<HTMLElement>('.mood-date-items') ?? null;

    if (!group || !items) {
      const created = createMoodDateGroup(ownerDocument, run.key, now);
      group = created.group;
      items = created.items;
      const previous = existingGroups[index - 1] ?? null;
      if (previous && previous.parentNode === parent) {
        previous.after(group);
      } else {
        parent.appendChild(group);
      }
      existingGroups[index] = group;
    } else {
      group.dataset.date = run.key;
      const dateText = group.querySelector<HTMLElement>('.mood-date-text');
      if (dateText) dateText.textContent = formatMoodDateHeader(run.key, now);
    }

    run.items.forEach((item) => {
      items!.appendChild(item);
    });
  });

  // Drop any leftover server groups the local regroup no longer fills.
  existingGroups.slice(runs.length).forEach((group) => {
    group.remove();
  });
}
