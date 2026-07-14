import { expect, test } from 'bun:test';
import { load } from 'cheerio';
import { renderToStaticMarkup } from 'react-dom/server';
import { DecodeTextPreview } from '@/features/components/previews/DecodeTextPreview';

test('decode preview exposes replay as a named native button', () => {
  const markup = renderToStaticMarkup(<DecodeTextPreview />);
  const $ = load(markup);

  expect($('button[type="button"][aria-label="Replay decode text animation"]').length).toBe(1);
  expect(
    $('button[type="button"][aria-label="Replay decode text animation"] > span.decode-preview').length
  ).toBe(1);
});
