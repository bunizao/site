export interface TimelineDateStateInput {
  anchors: number[];
  feedBottomY: number;
  scrollY: number;
  viewportHeight: number;
}

export interface TimelineDateState {
  progressIndex: number;
  activeIndex: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export function getTimelineDateState({
  anchors,
  feedBottomY,
  scrollY,
  viewportHeight,
}: TimelineDateStateInput): TimelineDateState {
  const totalDates = anchors.length;
  if (totalDates === 0) {
    return { progressIndex: 0, activeIndex: -1 };
  }

  const focusY = scrollY + viewportHeight * 0.5;

  if (totalDates === 1) {
    const span = Math.max(feedBottomY - anchors[0], 1);
    const progressIndex = (focusY - anchors[0]) / span;
    return {
      progressIndex,
      activeIndex: 0,
    };
  }

  const lastIndex = totalDates - 1;
  let progressIndex = 0;
  let activeIndex = 0;

  if (focusY <= anchors[0]) {
    progressIndex = 0;
  } else {
    for (let index = 0; index < lastIndex; index += 1) {
      const start = anchors[index];
      const end = anchors[index + 1];
      if (focusY < end) {
        const span = Math.max(end - start, 1);
        const localProgress = clamp((focusY - start) / span, 0, 1);
        progressIndex = index + localProgress;
        activeIndex = index;
        return { progressIndex, activeIndex };
      }
    }

    const lastStart = anchors[lastIndex];
    const lastSpan = Math.max(feedBottomY - lastStart, 1);
    progressIndex = lastIndex + (focusY - lastStart) / lastSpan;
    activeIndex = lastIndex;
  }

  return { progressIndex, activeIndex };
}
