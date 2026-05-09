import { defineMotion } from '../model';

export const PEEK_DISSOLVE_MOTION = defineMotion('peek.motion.dissolve', 'dissolve', 14, [
  '.##....##.|###....###|##########|##########|##o####o##|##o##*#o##|##########',
  '.#.....##.|##.....###|#########.|##.#######|##o####o##|##o##*#o##|#########.',
  '.#.....#..|##.....##.|##.######.|#..#######|#.o####.##|##o##*#o##|##.#####.#',
  '.#......#.|.#.....##.|##.####...|...######.|#.o##..#..|.#o##*#.o#|.#.#.###..',
  '..#.....#.|..#.....#.|.#...##...|...#####..|..#....#..|.#...*#...|.#...#....',
  '..#.......|..........|.....##...|.....#....|.......#..|.....*....|.#........',
  '..........|..........|.....#....|..........|..........|.....*....|..........',
  '..........|..........|..........|..........|..........|.....*....|..........',
], {
  label: 'Dissolve',
  summary: 'Pixels scatter away and the nose lingers last.',
  usage: 'Exit transition when the mascot should vanish with intent.',
  status: 'active',
  tags: ['utility', 'transition'],
  motionKind: 'one-shot',
  loop: false,
  previewLoop: true,
  order: 100,
});
