import type { MoodContentDocument } from '@bunizao/contracts';
import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';

/**
 * Self-contained fixture that exercises the full Telegram Bot API rich HTML set
 * (https://core.telegram.org/bots/api#html-style) in the exact normalized form
 * `site-api` emits. It runs through the real v2 sanitizer + CSS + hydration, so
 * it doubles as a local dev demo and a rendering regression baseline.
 *
 * Enable with `MOOD_RICHTEXT_FIXTURE=1` (dev only). When enabled, the mood
 * surface serves this document instead of hitting the API service binding.
 */
export const MOOD_RICH_TEXT_FIXTURE_ID = '3568';

const FIXTURE_ENV_NAME = 'MOOD_RICHTEXT_FIXTURE';

export function isMoodRichTextFixtureEnabled(locals: RuntimeEnvLocals | undefined): boolean {
  const value = readOptionalEnv(locals, FIXTURE_ENV_NAME);
  if (!value) return false;

  const normalized = value.trim().toLowerCase();
  return normalized !== '0'
    && normalized !== 'false'
    && normalized !== 'no'
    && normalized !== 'off';
}

// Every entity Telegram's HTML style supports, mirroring site-api's
// telegram-rich-text.ts output: bold/italic/underline/strikethrough/spoiler,
// inline code, language-tagged and plain <pre>, links, custom emoji, and both
// plain and expandable blockquotes.
const FIXTURE_BODY_HTML = [
  '<p>Telegram <strong>Bot API</strong> rich text — <em>full coverage</em> demo.</p>',
  '<p>Inline styles: <strong>bold</strong>, <em>italic</em>, <u>underline</u>, '
    + '<s>strikethrough</s>, and <strong><em>bold italic</em></strong> combined.</p>',
  '<p>Spoilers stay hidden until tapped: the answer is '
    + '<span class="tg-spoiler">42, obviously</span>. Even '
    + '<span class="tg-spoiler"><strong>nested bold</strong> inside</span> works.</p>',
  '<p>Links: <a href="https://core.telegram.org/bots/api#html-style">the HTML style spec</a>, '
    + 'a <a href="mailto:hi@buxx.me">mailto link</a>, and an <a href="/mood">internal link</a>.</p>',
  '<p>Inline <code>code()</code> sits next to a custom emoji '
    + '<span class="tg-emoji" data-emoji-id="5458403743835889060">😂</span> on the same line.</p>',
  '<pre><code class="language-typescript">export function greet(name: string): string {\n'
    + '  return `Hello, ${name}!`; // language-tagged block\n'
    + '}</code></pre>',
  '<pre><code>plain pre block\n'
    + '  preserves    whitespace\n'
    + 'and newlines</code></pre>',
  '<blockquote>A normal blockquote — single level, left bar.</blockquote>',
  '<blockquote class="tg-blockquote-expandable">An expandable blockquote. Telegram collapses long '
    + 'quotes like this one and lets readers expand them. This copy is intentionally long so the '
    + 'expand affordance has something to clamp: lorem ipsum dolor sit amet, consectetur adipiscing '
    + 'elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim '
    + 'veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</blockquote>',
].join('');

const FIXTURE_PREVIEW_TEXT =
  'Telegram Bot API rich text — full coverage demo.';

export function buildMoodRichTextFixtureDocument(channelSlug?: string): MoodContentDocument {
  return {
    id: MOOD_RICH_TEXT_FIXTURE_ID,
    source: 'mood',
    datetime: '2026-06-12T12:57:14+00:00',
    tag: 'richtext',
    bodyHtml: FIXTURE_BODY_HTML,
    previewText: FIXTURE_PREVIEW_TEXT,
    previewHtml: FIXTURE_PREVIEW_TEXT,
    hero: null,
    media: [],
    forwardedFrom: null,
    quote: null,
    reactions: [],
    commentsCount: 0,
    channel: {
      slug: channelSlug || 'tutumood',
      title: 'Levitating',
    },
  };
}
