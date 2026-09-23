// Pre-paint local-timezone regroup of the SSR mood feed.
//
// The server groups posts by UTC day; the bundled controller regroups them in
// the visitor's timezone, but by the time that module executes the feed has
// painted, so minted or merged date groups register as layout shifts. This
// file is injected verbatim as an inline <script> right after the feed markup
// (see FeedShell.astro), so it runs during HTML parsing, before first paint.
//
// KEEP IN SYNC with rekeyMoodServerRenderedGroups and the format helpers in
// src/features/mood/shared/date-grouping.ts. The mood-date-grouping unit test
// runs both implementations on the same fixtures and fails on divergence. The
// module version still runs after hydration as an idempotent safety net.
(() => {
  const feedList = document.querySelector('[data-mood-list]');
  if (!feedList) return;
  try {
    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const formatTime = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const formatDateKey = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const formatDateHeader = (dateKey, now) => {
      const parts = dateKey.split('-').map(Number);
      const date = new Date(parts[0], parts[1] - 1, parts[2]);
      const isSameDay = (candidate, target) => (
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
    };

    const createGroup = (ownerDocument, dateKey, now) => {
      const group = ownerDocument.createElement('div');
      group.className = 'mood-date-group';
      group.dataset.date = dateKey;

      const header = ownerDocument.createElement('div');
      header.className = 'mood-date-header';

      const dateText = ownerDocument.createElement('span');
      dateText.className = 'mood-date-text';
      dateText.textContent = formatDateHeader(dateKey, now);

      const dateLine = ownerDocument.createElement('div');
      dateLine.className = 'mood-date-line';

      header.appendChild(dateText);
      header.appendChild(dateLine);

      const items = ownerDocument.createElement('div');
      items.className = 'mood-date-items';

      group.appendChild(header);
      group.appendChild(items);
      return { group, items };
    };

    const list = feedList;
    const ownerDocument = list.ownerDocument;
    if (!ownerDocument) return;

    const existingGroups = Array.from(list.querySelectorAll('.mood-date-group'));
    if (existingGroups.length === 0) return;

    const orderedItems = [];
    existingGroups.forEach((group) => {
      group.querySelectorAll('.mood-date-items > .mood-item').forEach((item) => {
        orderedItems.push(item);
      });
    });
    if (orderedItems.length === 0) return;

    const now = new Date();
    const runs = [];
    orderedItems.forEach((item) => {
      const keySource = item.querySelector('.mood-item-time')
        || item.querySelector('time[datetime]');
      const datetime = (keySource && keySource.getAttribute('datetime')) || '';
      const key = formatDateKey(datetime);
      if (!key) return;

      item.querySelectorAll('time[datetime]').forEach((timeEl) => {
        const localTime = formatTime(timeEl.getAttribute('datetime') || '');
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

    const anchor = existingGroups[0];
    const parent = anchor.parentNode;
    if (!parent) return;

    runs.forEach((run, index) => {
      let group = existingGroups[index] || null;
      let items = group ? group.querySelector('.mood-date-items') : null;

      if (!group || !items) {
        const created = createGroup(ownerDocument, run.key, now);
        group = created.group;
        items = created.items;
        const previous = existingGroups[index - 1] || null;
        if (previous && previous.parentNode === parent) {
          previous.after(group);
        } else {
          parent.appendChild(group);
        }
        existingGroups[index] = group;
      } else {
        group.dataset.date = run.key;
        const dateText = group.querySelector('.mood-date-text');
        if (dateText) dateText.textContent = formatDateHeader(run.key, now);
      }

      run.items.forEach((item) => {
        items.appendChild(item);
      });
    });

    existingGroups.slice(runs.length).forEach((group) => {
      group.remove();
    });
  } catch {
    // Leave the SSR grouping in place; the hydrated controller still rekeys.
  } finally {
    // The list is server-rendered with visibility:hidden so the regroup above
    // never mutates painted content. Reveal it whether or not the rekey ran.
    feedList.style.removeProperty('visibility');
  }
})();
