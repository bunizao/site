import { describe, expect, it } from 'bun:test';
import { getMoodMosaicSpans } from '@/features/mood/shared/gallery-render';

const COLUMNS = 6;

/* The tiles have to tile: the cells they cover must add up to whole rows of
   six, or the block ends with a hole in it -- which is the one thing a fixed
   mosaic cannot do. */
function coveredCells(count: number): number {
  return getMoodMosaicSpans(count).reduce((total, { span, rows }) => total + span * rows, 0);
}

describe('getMoodMosaicSpans', () => {
  it('gives every image a span', () => {
    for (let count = 1; count <= 20; count += 1) {
      expect(getMoodMosaicSpans(count)).toHaveLength(count);
    }
  });

  it('covers whole rows, leaving no hole at the end', () => {
    for (let count = 1; count <= 20; count += 1) {
      expect(coveredCells(count) % COLUMNS).toBe(0);
    }
  });

  it('splits a pair down the middle', () => {
    // One row, two halves. The CSS holds the block square, so each half is a
    // full-height pane rather than a strip.
    expect(getMoodMosaicSpans(2)).toEqual([
      { span: 3, rows: 1 },
      { span: 3, rows: 1 },
    ]);
  });

  it('puts a tall pane beside a stacked pair for three', () => {
    expect(getMoodMosaicSpans(3)).toEqual([
      { span: 3, rows: 2 },
      { span: 3, rows: 1 },
      { span: 3, rows: 1 },
    ]);
  });

  it('splits a short trailing row instead of leaving a gap', () => {
    expect(getMoodMosaicSpans(7).at(-1)).toEqual({ span: 6, rows: 1 });
    expect(getMoodMosaicSpans(8).slice(-2)).toEqual([
      { span: 3, rows: 1 },
      { span: 3, rows: 1 },
    ]);
    expect(getMoodMosaicSpans(9).at(-1)).toEqual({ span: 2, rows: 1 });
  });
});
