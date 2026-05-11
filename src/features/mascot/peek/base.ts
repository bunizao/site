import { gridFromPatternRows, type MascotIdentity } from './model';

export const PEEK_BASE: MascotIdentity = {
  id: 'peek',
  name: 'peek',
  tagline: 'the lurker',
  blurb: 'only the top of the head shows. listening. never types first.',
  width: 10,
  height: 7,
  base: gridFromPatternRows([
    '.##....##.',
    '###....###',
    '##########',
    '##########',
    '##o####o##',
    '##o##*#o##',
    '##########',
  ]),
  accent: 'oklch(0.62 0.13 25)',
};
