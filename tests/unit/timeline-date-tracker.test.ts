import { describe, expect, test } from 'bun:test';

import { getTimelineDateState } from '../../src/features/mood/client/timeline-date-tracker';

describe('getTimelineDateState', () => {
  test('keeps the active date while the tracking line remains inside that date section', () => {
    const state = getTimelineDateState({
      anchors: [100, 900, 1600],
      feedBottomY: 2200,
      scrollY: 520,
      viewportHeight: 600,
    });

    expect(state.activeIndex).toBe(0);
    expect(state.progressIndex).toBeCloseTo(0.9);
  });

  test('switches dates when the tracking line reaches the next section', () => {
    const state = getTimelineDateState({
      anchors: [100, 900, 1600],
      feedBottomY: 2200,
      scrollY: 600,
      viewportHeight: 600,
    });

    expect(state.activeIndex).toBe(1);
    expect(state.progressIndex).toBe(1);
  });

  test('keeps the final date active through the feed tail', () => {
    const state = getTimelineDateState({
      anchors: [100, 900, 1600],
      feedBottomY: 2200,
      scrollY: 1700,
      viewportHeight: 600,
    });

    expect(state.activeIndex).toBe(2);
    expect(state.progressIndex).toBeGreaterThan(2);
  });
});
