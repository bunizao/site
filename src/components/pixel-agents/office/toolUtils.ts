/** Map status prefixes back to tool names for animation selection */
export const STATUS_TO_TOOL: Record<string, string> = {
  Reading: 'Read',
  Searching: 'Grep',
  Globbing: 'Glob',
  Fetching: 'WebFetch',
  'Searching web': 'WebSearch',
  Writing: 'Write',
  Editing: 'Edit',
  Running: 'Bash',
  Task: 'Task',
};

export function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool;
  }
  const first = status.split(/[\s:]/)[0];
  return first || null;
}

import { TILE_SIZE, ZOOM_DEFAULT_DPR_FACTOR, ZOOM_MAX, ZOOM_MIN } from '../constants.js';

/** Compute a default integer zoom level (device pixels per sprite pixel) */
export function defaultZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(ZOOM_MIN, Math.round(ZOOM_DEFAULT_DPR_FACTOR * dpr));
}

/** Fit the office map into the viewport while keeping integer pixel scaling. */
export function fitZoomToViewport(
  cols: number,
  rows: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (cols <= 0 || rows <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return defaultZoom();
  }

  const dpr = window.devicePixelRatio || 1;
  const mapWidth = cols * TILE_SIZE;
  const mapHeight = rows * TILE_SIZE;
  const cssScale = Math.max(
    1,
    Math.floor(Math.min((viewportWidth * 0.96) / mapWidth, (viewportHeight * 0.96) / mapHeight)),
  );
  const deviceZoom = Math.round(cssScale * dpr);
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, deviceZoom));
}
