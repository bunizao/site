// Boot for the desk at /new: the easel and what moves in its painting (the
// clock, the lamp, the record and the music off it, the coffee's steam), the
// turntable's arm, the subscriptions and the letter in the panels, the
// speaker in the letterhead, and the foil on the student card.
import { initClock } from './clock';
import { initEasel } from './easel';
import { initFoil } from './foil';
import { initLamp } from './lamp';
import { initLetter } from './letter';
import { initMoods } from './moods';
import { initNotes } from './notes';
import { initSoundToggle } from './sound';
import { initSubscribe } from './subscribe';
import { initSteam } from './steam';
import { initTonearm } from './tonearm';
import { initTurntable } from './turntable';

// The foil's shader compiles the first time the card is on the canvas, once
// the page is idle, not on every visit. The foil finds the card by where it
// is on screen, so it cannot start while the card is hidden.
function initFoilOnShow() {
  const easel = document.querySelector('[data-easel]');
  const onShown = (event: Event) => {
    if ((event as CustomEvent<string>).detail !== 'about') return;
    easel?.removeEventListener('easel:shown', onShown);
    (window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 200)))(() => initFoil());
  };
  easel?.addEventListener('easel:shown', onShown);
}

// The clock, the steam and the lamp hang their canvases in the painting
// before the easel paints it; the easel makes the record's turntable. A
// link to /new#about shows the card as the easel starts, so the foil listens
// first.
initFoilOnShow();
initClock();
initSteam();
initLamp();
initEasel();
initTurntable();
initTonearm();
initNotes();
initMoods();
initSubscribe();
initLetter();
initSoundToggle();
