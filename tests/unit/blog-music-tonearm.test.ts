import { expect, test } from 'bun:test';

const css = await Bun.file(new URL('../../src/styles/blog-prose.css', import.meta.url)).text();

test('keeps the blog music tonearm visible at rest', () => {
  const rule = css.match(/\.blog-prose \.blog-music__tonearm \{(?<body>[\s\S]*?)\n\}/u);

  expect(rule?.groups?.body).toMatch(/opacity:\s*(?:0\.[1-9]\d*|1)\s*;/u);
});
