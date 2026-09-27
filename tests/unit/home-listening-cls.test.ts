import { describe, expect, test } from 'bun:test';

const listeningCss = await Bun.file(
  new URL('../../src/styles/listening.css', import.meta.url),
).text();

describe('listening card placeholder dimensions', () => {
  // Each pill used to carry a fixed `height` shorter than the font-size/
  // line-height it inherits once real text lands, so applyTrack() removing
  // is-loading grew the card by a few px on every load — a guaranteed CLS
  // hit. Dropping the override lets the skeleton occupy the same line box
  // the populated text will.
  test('skeleton lines no longer override height away from the populated line box', () => {
    expect(listeningCss).toContain(
      '.listening.is-loading .listening-eyebrow-text {\n  --line-index: 0;\n  min-width: 78px;\n}',
    );
    expect(listeningCss).toContain(
      '.listening.is-loading .listening-title {\n  --line-index: 1;\n  min-width: 160px;\n  transition: none;\n}',
    );
    expect(listeningCss).toContain(
      '.listening.is-loading .listening-artist {\n  --line-index: 2;\n  min-width: 94px;\n}',
    );
    expect(listeningCss).toContain(
      ".listening.is-loading .listening-meta span:not(.listening-meta-dot) {\n  --line-index: 3;\n  min-width: 58px;\n}",
    );
  });
});
