import { decodeText, type DecodeController, type DecodeLayout, type DecodeOrder } from '../src/index';

const getById = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = getById<HTMLDivElement>('stage');
const text = getById<HTMLTextAreaElement>('text');
const layout = getById<HTMLSelectElement>('layout');
const order = getById<HTMLSelectElement>('order');
const font = getById<HTMLSelectElement>('font');
const charset = getById<HTMLInputElement>('charset');
const speed = getById<HTMLInputElement>('speed');
const boil = getById<HTMLInputElement>('boil');
const done = getById<HTMLInputElement>('done');
const speedOut = getById<HTMLOutputElement>('speedOut');
const boilOut = getById<HTMLOutputElement>('boilOut');
const doneOut = getById<HTMLOutputElement>('doneOut');
const replay = getById<HTMLButtonElement>('replay');

let controller: DecodeController | null = null;

// Rebuild the stage from the textarea: lines become <br>, **chunks** become
// highlighted spans (exercises the package's style baking).
const renderStage = (): void => {
  const p = document.createElement('p');
  p.style.margin = '0';
  text.value.split('\n').forEach((line, i) => {
    if (i > 0) p.appendChild(document.createElement('br'));
    line.split('**').forEach((seg, j) => {
      if (j % 2 === 1) {
        const hl = document.createElement('span');
        hl.className = 'hl';
        hl.textContent = seg;
        p.appendChild(hl);
      } else {
        p.appendChild(document.createTextNode(seg));
      }
    });
  });
  stage.replaceChildren(p);
};

const run = async (): Promise<void> => {
  controller?.cancel();
  stage.classList.toggle('sans', font.value === 'sans');
  renderStage();
  speedOut.value = `${speed.value}ms/char`;
  boilOut.value = `${boil.value}Hz`;
  doneOut.value = done.value;
  controller = await decodeText(stage, {
    layout: layout.value as DecodeLayout,
    order: order.value as DecodeOrder,
    charset: charset.value || undefined,
    durationPerChar: Number(speed.value) / 1000,
    mutationHz: Number(boil.value),
    donePower: Number(done.value),
    maxLineDuration: 3,
  });
};

replay.addEventListener('click', run);
for (const el of [layout, order, font]) el.addEventListener('change', run);

void run();
