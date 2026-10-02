// Boot for the desk at /new: the easel, the clock in it, the foil on the
// student card, and the phone menu in the nav card.
import { initClock } from './clock';
import { initEasel } from './easel';
import { initFoil } from './foil';

// A native <details> stays open until its summary is pressed again. A menu
// should also close on a press anywhere else, on Esc, and once a link in it
// is followed.
function initMenu() {
  const menu = document.querySelector<HTMLDetailsElement>('.desk-menu');
  if (!menu) return;
  document.addEventListener('click', (event) => {
    if (!menu.open) return;
    const target = event.target as Element;
    if (!menu.contains(target) || target.closest('a')) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });
}

initEasel();
initClock();
initMenu();
// The shader compiles once the page is idle, not on the critical path.
(window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 200)))(() => initFoil());
