import { describe, expect, test } from 'bun:test';

import {
  getScrollYForDateProgress,
  getTimelineDateState,
} from '../../src/features/mood/client/timeline-date-tracker';

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

describe('getScrollYForDateProgress', () => {
  const anchors = [1000, 1800, 2600];
  const feedBottomY = 3400;
  const viewportHeight = 600;

  test('lands a date header on the tracking line at a whole index', () => {
    const scrollY = getScrollYForDateProgress({
      anchors,
      feedBottomY,
      progressIndex: 1,
      viewportHeight,
    });

    expect(scrollY).toBe(1800 - 300);
  });

  test('round-trips against getTimelineDateState', () => {
    for (const progressIndex of [0, 0.25, 1, 1.5, 2, 2.75]) {
      const scrollY = getScrollYForDateProgress({
        anchors,
        feedBottomY,
        progressIndex,
        viewportHeight,
      });
      const state = getTimelineDateState({ anchors, feedBottomY, scrollY, viewportHeight });

      expect(state.progressIndex).toBeCloseTo(progressIndex, 5);
    }
  });

  test('interpolates through the tail span past the last anchor', () => {
    const scrollY = getScrollYForDateProgress({
      anchors,
      feedBottomY,
      progressIndex: 2.5,
      viewportHeight,
    });

    expect(scrollY).toBe(2600 + 0.5 * (3400 - 2600) - 300);
  });

  test('never asks for a negative scroll position', () => {
    const scrollY = getScrollYForDateProgress({
      anchors: [10],
      feedBottomY: 900,
      progressIndex: 0,
      viewportHeight: 600,
    });

    expect(scrollY).toBe(0);
  });

  test('returns 0 with no dates', () => {
    expect(
      getScrollYForDateProgress({ anchors: [], feedBottomY: 0, progressIndex: 3, viewportHeight: 600 })
    ).toBe(0);
  });
});
