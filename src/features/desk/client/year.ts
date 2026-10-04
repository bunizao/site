// The painted year on the GitHub panel (ui/GitHub.astro). The first time the
// panel opens it asks for the year, puts it on the canvas for the `year`
// study to paint, and puts the year's total in the card's corner. The
// pointer, or a finger run along it, reads out the day under it.
const ENDPOINT = '/api/github/contributions?days=365';

interface ContributionDay {
  date: string;
  count: number;
  level: number;
}

const dateOf = (day: ContributionDay) => new Date(`${day.date}T00:00:00Z`);
const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

export function initYear() {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const root = document.querySelector<HTMLElement>('[data-year]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-year-canvas]');
  const grid = canvas?.parentElement;
  const mark = root?.querySelector<HTMLElement>('[data-year-mark]');
  const months = root?.querySelector<HTMLElement>('[data-year-months]');
  const read = root?.querySelector<HTMLElement>('[data-year-read]');
  const total = root?.querySelector<HTMLElement>('[data-year-total]');
  if (!easel || !root || !canvas || !grid || !mark || !months || !read || !total) return;

  const resting = matchMedia('(hover: none)').matches ? 'Run a finger along the year to read a day.' : 'Point at a day to read it.';
  let year: ContributionDay[] = [];
  let first = 0;
  let weeks = 53;

  const lay = (data: ContributionDay[]) => {
    year = data;
    first = dateOf(data[0]).getUTCDay();
    weeks = Math.ceil((first + data.length) / 7);
    root.style.setProperty('--weeks', String(weeks));
    canvas.dataset.levels = data.map((day) => Math.min(4, Math.max(0, day.level | 0))).join('');
    canvas.dataset.weekday = String(first);

    // A month's name over the week its first day falls in, unless the last
    // name is still too close.
    let last = -3;
    months.replaceChildren(
      ...data.flatMap((day, i) => {
        const col = Math.floor((first + i) / 7);
        if (!day.date.endsWith('-01') || col - last < 3) return [];
        last = col;
        const label = document.createElement('span');
        label.textContent = shortMonth.format(dateOf(day));
        label.style.setProperty('--col', String(col));
        return [label];
      }),
    );

    total.textContent = data.reduce((sum, day) => sum + day.count, 0).toLocaleString('en-US');
    read.textContent = resting;
    root.classList.add('is-ready');
    root.dispatchEvent(new CustomEvent('easel:repaint', { bubbles: true }));
  };

  let asked = false;
  const load = () => {
    if (asked) return;
    asked = true;
    fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { contributions?: ContributionDay[] }) => {
        if (data.contributions?.length) lay(data.contributions);
      })
      .catch(() => {
        read.textContent = "The year didn't load just now.";
      });
  };
  easel.addEventListener('easel:shown', (event) => {
    if ((event as CustomEvent<string>).detail === 'github') load();
  });
  if (!root.closest<HTMLElement>('[data-panel]')?.hidden) load();

  // --- Reading a day -------------------------------------------------------------
  const point = (event: PointerEvent) => {
    if (!year.length) return;
    const box = grid.getBoundingClientRect();
    const col = Math.min(weeks - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * weeks)));
    const row = Math.min(6, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * 7)));
    // Past either end of the year, the nearest day it has.
    const index = Math.min(year.length - 1, Math.max(0, col * 7 + row - first));
    const day = year[index];
    const at = first + index;
    mark.style.setProperty('--col', String(Math.floor(at / 7)));
    mark.style.setProperty('--row', String(at % 7));
    mark.hidden = false;
    read.textContent = `${longDay.format(dateOf(day))}: ${day.count === 0 ? 'nothing' : `${day.count.toLocaleString('en-US')} ${day.count === 1 ? 'contribution' : 'contributions'}`}`;
  };
  const rest = () => {
    mark.hidden = true;
    if (year.length) read.textContent = resting;
  };

  grid.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') grid.setPointerCapture(event.pointerId);
    point(event);
  });
  grid.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || grid.hasPointerCapture(event.pointerId)) point(event);
  });
  grid.addEventListener('pointerleave', (event) => event.pointerType === 'mouse' && rest());
  grid.addEventListener('pointerup', (event) => event.pointerType !== 'mouse' && rest());
  grid.addEventListener('pointercancel', rest);
}
