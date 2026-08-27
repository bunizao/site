import { describe, expect, test } from 'bun:test';

import {
  isConversationLanguage,
  nameOnBackground,
  parseConversation,
  renderConversation,
  setConversationOption,
  textOnAccent,
  tintedBubble,
} from '@/features/content/conversation';
import { splitBlogProse } from '@/features/posts/server/code-blocks';

const BUBBLE_LIGHT = '#ECECEC';
const BUBBLE_DARK = '#232323';
const PAGE_LIGHT = '#FFFFFF';
const PAGE_DARK = '#0A0A0A';

function toRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16)) as [number, number, number];
}

function ratio(a: string, b: string): number {
  const channel = (color: [number, number, number]) =>
    color
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const relative = (color: [number, number, number]) => {
    const [r, g, b] = channel(color);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [relative(toRgb(a)), relative(toRgb(b))].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe('conversation parsing', () => {
  test('reads visibility options from a complete fenced source', () => {
    const source = [
      '```conversation',
      '@conversation avatars=off names=on',
      'me: hi',
      '```',
    ].join('\n');
    const { items, options } = parseConversation(source);

    expect(options).toEqual({ avatars: false, names: true, tints: true });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'group' });
  });

  test('rewrites a visibility option inside the copyable source', () => {
    const source = [
      '```conversation',
      '@conversation avatars=on names=on',
      'me: hi',
      '```',
    ].join('\n');

    expect(setConversationOption(source, 'avatars', false)).toBe([
      '```conversation',
      '@conversation avatars=off names=on tints=on',
      'me: hi',
      '```',
    ].join('\n'));
  });

  test('keeps malformed or misplaced conversation options visible', () => {
    const malformed = parseConversation('@conversation avatars=hidden\nme: hi');
    const misplaced = parseConversation('me: hi\n@conversation names=off');

    expect(malformed.options).toEqual({ avatars: true, names: true, tints: true });
    expect(malformed.items[0]).toEqual({ type: 'note', text: '@conversation avatars=hidden' });
    expect(misplaced.items[1]).toEqual({ type: 'note', text: '@conversation names=off' });
  });

  test('auto-registers speakers so a two-party exchange needs no cast lines', () => {
    const { cast, items } = parseConversation(['ann: hello', 'bob: hi'].join('\n'));

    expect([...cast.keys()]).toEqual(['ann', 'bob']);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'group' });
  });

  test('gives the trailing side to the first voice when no own-side key speaks', () => {
    const { cast } = parseConversation(['ann: hello', 'bob: hi'].join('\n'));

    expect(cast.get('ann')?.me).toBe(true);
    expect(cast.get('bob')?.me).toBe(false);
  });

  test('an own-side key takes that side wherever it speaks', () => {
    const { cast } = parseConversation(['ann: hello', 'me: hi'].join('\n'));

    expect(cast.get('ann')?.me).toBe(false);
    expect(cast.get('me')?.me).toBe(true);
  });

  test('reads you, 我 and 你 as own-side keys too', () => {
    const { cast } = parseConversation(['ann: hello', 'you: a', '我: b', '你: c'].join('\n'));

    expect(cast.get('ann')?.me).toBe(false);
    expect([cast.get('you'), cast.get('我'), cast.get('你')].map((s) => s?.me)).toEqual([
      true,
      true,
      true,
    ]);
  });

  test('collapses consecutive messages from one speaker into a single run', () => {
    const { items } = parseConversation(['ann: one', 'ann: two', 'bob: three'].join('\n'));

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'group' });
    if (items[0].type !== 'group') throw new Error('expected a group');
    expect(items[0].bubbles).toHaveLength(2);
  });

  test('an indented line soft-wraps into the current bubble', () => {
    const { items } = parseConversation(['ann: first', '  second'].join('\n'));

    if (items[0].type !== 'group') throw new Error('expected a group');
    expect(items[0].bubbles).toHaveLength(1);
    // A wrapped source line is not a paragraph break: authors wrap for
    // readability and do not expect a visible gap mid-sentence.
    expect(items[0].bubbles[0].text).toBe('first second');
  });

  test('joins a CJK seam tight and a Latin seam with a space', () => {
    const cjk = parseConversation(['ann: 得用同一套规则排出', '  来，而且都要好看。'].join('\n'));
    const latin = parseConversation(['ann: one number', '  lands on 30'].join('\n'));
    const mixed = parseConversation(['ann: 拉丁字母大约', '  0.5em'].join('\n'));

    if (cjk.items[0].type !== 'group') throw new Error('expected a group');
    if (latin.items[0].type !== 'group') throw new Error('expected a group');
    if (mixed.items[0].type !== 'group') throw new Error('expected a group');

    expect(cjk.items[0].bubbles[0].text).toBe('得用同一套规则排出来，而且都要好看。');
    expect(latin.items[0].bubbles[0].text).toBe('one number lands on 30');
    // Either side CJK joins tight: never insert a character the source lacks.
    expect(mixed.items[0].bubbles[0].text).toBe('拉丁字母大约0.5em');
  });

  test('a blank line starts a new bubble rather than a new paragraph', () => {
    const { items } = parseConversation(['ann: first', '', '  loose line'].join('\n'));

    expect(items[1]).toEqual({ type: 'note', text: 'loose line' });
  });

  test('does not put an empty line inside a bubble', () => {
    const { items } = parseConversation(['ann: first', '', 'ann: second'].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'group',
      bubbles: [{ text: 'first' }, { text: 'second' }],
    });
  });

  test('keeps an unindented prose line out of the current bubble', () => {
    const { items } = parseConversation(['ann: first', 'So here is the thing: it works'].join('\n'));

    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ type: 'note', text: 'So here is the thing: it works' });
  });

  test('keeps malformed cast lines visible after a message', () => {
    const { items } = parseConversation(['ann: first', '@bad unknown'].join('\n'));

    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ type: 'note', text: '@bad unknown' });
  });

  test('does not keep a run open across an unindented note', () => {
    const { items } = parseConversation(['ann: first', 'plain prose', 'ann: second'].join('\n'));

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ type: 'group' });
    expect(items[1]).toEqual({ type: 'note', text: 'plain prose' });
    expect(items[2]).toMatchObject({ type: 'group' });
  });

  test('parses dividers with and without a label', () => {
    const { items } = parseConversation(['ann: hi', '--- later', 'ann: back', '---'].join('\n'));

    expect(items[1]).toEqual({ type: 'note', text: 'later' });
    expect(items[3]).toEqual({ type: 'note', text: '' });
  });

  test('a divider breaks a run so the next message is labelled again', () => {
    const { items } = parseConversation(['ann: hi', '---', 'ann: back'].join('\n'));

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ type: 'group' });
    expect(items[2]).toMatchObject({ type: 'group' });
  });

  test('does not turn a bare URL into a phantom speaker', () => {
    const { cast } = parseConversation('https://example.com/a');

    expect(cast.size).toBe(0);
  });

  test('keeps the first-voice fallback when a reserved speaker is only declared', () => {
    const { cast } = parseConversation(['@you [Reader]', 'ann: hi'].join('\n'));

    expect(cast.get('you')?.me).toBe(false);
    expect(cast.get('ann')?.me).toBe(true);
  });

  test('labels a speaker exactly as first written, matching on case-insensitively', () => {
    const { cast } = parseConversation(['@Ada accent=#B4603A', 'ada: hi', 'ADA: again'].join('\n'));

    expect(cast.size).toBe(1);
    expect(cast.get('ada')?.label).toBe('Ada');
  });

  test('reads a bracketed display name, the names a key cannot spell', () => {
    const { cast } = parseConversation(['@ada [Ada Lovelace]', '@tutu [图图] avatar=\u{1F408}'].join('\n'));

    expect(cast.get('ada')?.label).toBe('Ada Lovelace');
    expect(cast.get('tutu')?.label).toBe('图图');
    expect(cast.get('tutu')?.avatar).toBe('\u{1F408}');
  });

  test('a display name is never mistaken for the own side', () => {
    const { cast } = parseConversation(['ann: hi', '@ann [call me maybe]'].join('\n'));

    expect(cast.get('ann')?.label).toBe('call me maybe');
  });

  test('rejects a cast line the grammar has no place for, rendering it as prose', () => {
    for (const line of [
      '@Ada Lovelace accent=#4E7A5E',
      '@ada colour=#fff',
      '@ada label="Ada"',
      '@a accent=#fff[Injected]',
      '@a avatar="🐈"',
      '@a [A]avatar=x',
      '@a []',
      '@a accent=#fff accent=#000',
      '@a tints=maybe',
    ]) {
      const { cast, items } = parseConversation(line);

      expect(cast.size).toBe(0);
      expect(items).toEqual([{ type: 'note', text: line }]);
    }
  });

  test('rejects a key above the shared 24-character limit', () => {
    const key = 'a'.repeat(25);
    const { cast, items } = parseConversation(`@${key} accent=#4E7A5E`);

    expect(cast.size).toBe(0);
    expect(items).toEqual([{ type: 'note', text: `@${key} accent=#4E7A5E` }]);
  });

  test('counts Unicode code points rather than UTF-16 units in the key limit', () => {
    const key = '😀'.repeat(13);
    const { cast, items } = parseConversation(`${key}: hi`);

    expect(cast.has(key)).toBe(true);
    expect(items).toHaveLength(1);
  });

  test('does not let declarations bypass message-head safety', () => {
    for (const source of ['@https\nhttps: hi', '@a_b\na_b: hi', '@a*b\na*b: hi']) {
      const { cast, items } = parseConversation(source);

      expect(cast.size).toBe(0);
      expect(items).toHaveLength(2);
      expect(items[1]).toMatchObject({ type: 'note' });
    }
  });

  test('a key is one token, so a sentence with a colon stays prose', () => {
    const { cast, items } = parseConversation('So here is the thing: it works');

    expect(cast.size).toBe(0);
    expect(items).toEqual([{ type: 'note', text: 'So here is the thing: it works' }]);
  });

  test('ends the key at the attributes, not at a colon inside one', () => {
    const { cast } = parseConversation('@octo avatar=https://example.com/o.png');

    expect([...cast.keys()]).toEqual(['octo']);
    expect(cast.get('octo')?.avatar).toBe('https://example.com/o.png');
  });

  test('reads label, accent, tint preference and avatar off a cast line', () => {
    const { cast } = parseConversation('@tu [Tu Tu] accent=#B4603A avatar=🐈 tints=off');
    const speaker = cast.get('tu');

    expect(speaker?.label).toBe('Tu Tu');
    expect(speaker?.accent).toBe('#B4603A');
    expect(speaker?.avatar).toBe('🐈');
    expect(speaker?.tints).toBe(false);
  });
});

describe('conversation rendering', () => {
  test('renders source visibility options on the thread', () => {
    const html = renderConversation('@conversation avatars=off names=off\nme: hi');

    expect(html).toContain('data-avatars="off"');
    expect(html).toContain('data-names="off"');
  });

  test('labels a run once, above the stack rather than inside a bubble', () => {
    const html = renderConversation(['me: hi', 'ann: one', 'ann: two'].join('\n'));

    // One visible name for Ann's run, plus the screen-reader-only one on mine.
    expect(html.match(/class="conv-name/g)).toHaveLength(2);
    expect(html.match(/conv-name--sr/g)).toHaveLength(1);
    // The name heads the stack; the bubbles below it hold nothing but content.
    expect(html).toContain('<div class="conv-stack"><div class="conv-name"');
    expect(html).not.toContain('conv-bubble--wide"><div class="conv-name');
  });

  test('keeps the own-side label in the accessibility tree instead of dropping it', () => {
    const html = renderConversation('ann: mine');

    // Alignment and fill are the only visible attribution, and neither reaches
    // a screen reader.
    expect(html).toContain('conv-name conv-name--sr');
    expect(html).toContain('ann');
  });

  test('escapes markup in message bodies and speaker labels', () => {
    const html = renderConversation(
      ['@x [<script>]', 'x: <img src=x onerror=alert(1)>'].join('\n')
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renders the inline subset', () => {
    const html = renderConversation('ann: `code`, **bold**, *soft* and [link](https://example.com)');

    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>soft</em>');
    expect(html).toContain('<a href="https://example.com" rel="noopener">link</a>');
  });

  test('does not create links for unsupported URL schemes', () => {
    const html = renderConversation('ann: [run](javascript:alert%281%29)');

    expect(html).not.toContain('<a ');
    expect(html).toContain('javascript:alert%281%29');
  });

  test('keeps markdown-looking text inside code spans literal', () => {
    const html = renderConversation('ann: `[run](https://example.com)`');

    expect(html).toContain('<code>[run](https://example.com)</code>');
    expect(html).not.toContain('<a ');
  });

  test('renders each avatar form', () => {
    const html = renderConversation(
      [
        '@a [Ada Lovelace]',
        '@b avatar=https://example.com/b.png',
        '@c avatar=#sprite',
        '@d avatar=🐈',
        'a: 1',
        'b: 2',
        'c: 3',
        'd: 4',
      ].join('\n')
    );

    expect(html).toContain('>AL<'); // initials
    expect(html).toContain('referrerpolicy="no-referrer"'); // external image
    expect(html).toContain('<use href="#sprite">'); // sprite
    expect(html).toContain('🐈'); // glyph
  });

  test('takes the last character as the avatar for a CJK label', () => {
    const html = renderConversation(['@t [图图]', 't: hi'].join('\n'));

    expect(html).toContain('>图<');
  });

  test('emits no colour custom properties when no accent is declared', () => {
    const html = renderConversation('ann: hi');

    // The default is monochrome and lives in CSS, derived from --foreground.
    expect(html).not.toContain('--conv-accent');
  });

  test('namespaces every emitted custom property', () => {
    const html = renderConversation(['@a accent=#B4603A', '@b me', 'a: hi', 'b: yo'].join('\n'));

    // --accent and --radius are global site tokens; an un-prefixed name here
    // would shadow them for every descendant of the thread.
    expect(html).toContain('--conv-accent:#B4603A');
    for (const bare of ['"--accent', ';--accent', '"--radius', ';--radius']) {
      expect(html).not.toContain(bare);
    }
  });

  test('washes the receiving side\'s bubble with the accent', () => {
    const html = renderConversation(['@a accent=#4E7A5E', 'a: hi', 'you: yo'].join('\n'));

    // Without this the accent has nowhere to land on a thread whose names and
    // avatars are switched off: the own side is the only filled one.
    expect(html).toContain('--conv-tint-light:' + tintedBubble('#4E7A5E', BUBBLE_LIGHT));
    expect(html).toContain('--conv-tint-dark:' + tintedBubble('#4E7A5E', BUBBLE_DARK));
  });

  test('applies the thread tint default to every speaker', () => {
    const on = renderConversation(['@a accent=#4E7A5E', 'a: hi'].join('\n'));
    const off = renderConversation(
      ['@conversation tints=off', '@a accent=#4E7A5E', 'a: hi'].join('\n'),
    );

    expect(on).toContain('data-tints="on"');
    expect(off).toContain('data-tints="off"');
    expect(off).toContain('class="conv-group conv-group--out" data-tints="off"');
    expect(off).toContain('--conv-tint-light:');
  });

  test('lets each speaker override the thread tint default', () => {
    const disabled = renderConversation(
      ['@gemini [Gemini] accent=#4057C8 tints=off', 'you: compare', 'gemini: neutral'].join('\n'),
    );
    const enabled = renderConversation(
      [
        '@conversation tints=off',
        '@ada [Ada] accent=#287B74 tints=on',
        'you: compare',
        'ada: tinted',
      ].join('\n'),
    );

    expect(disabled).toContain(
      'class="conv-group conv-group--in" data-tints="off" style="--conv-accent:#4057C8',
    );
    expect(enabled).toContain(
      'class="conv-group conv-group--in" data-tints="on" style="--conv-accent:#287B74',
    );
  });

  test('leaves the bubble neutral when no accent is declared', () => {
    const html = renderConversation(['a: hi', 'you: yo'].join('\n'));

    expect(html).not.toContain('--conv-tint');
  });

  test('rejects an accent that is not a hex colour', () => {
    const html = renderConversation(['@a accent=javascript:alert(1)', 'a: hi'].join('\n'));

    expect(html).not.toContain('--conv-accent');
    expect(html).toContain('@a accent=javascript:alert(1)');
  });
});

describe('conversation contrast', () => {
  test('picks the readable end of the scale for text on a filled bubble', () => {
    expect(textOnAccent('#0A2540')).toBe('#FFFFFF');
    expect(textOnAccent('#F2E8C9')).toBe('#0A0A0A');
  });

  test('walks a name colour to AA against both page backgrounds', () => {
    // Hexes chosen as fills; several land near 4:1 when reused as name text.
    // The name sits beside the bubble, so the page is what it is read against.
    for (const accent of ['#3C5D80', '#B4603A', '#4E7A5E', '#7C5CD6', '#A8455F', '#2F6E7A']) {
      for (const page of [PAGE_LIGHT, PAGE_DARK]) {
        expect(ratio(nameOnBackground(accent, page), page)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('keeps a tinted bubble readable under its own body text', () => {
    // The tint replaces the neutral bubble, so the body copy has to survive it.
    for (const accent of ['#3C5D80', '#B4603A', '#4E7A5E', '#7C5CD6', '#A8455F', '#2F6E7A']) {
      expect(ratio('#0A0A0A', tintedBubble(accent, BUBBLE_LIGHT))).toBeGreaterThanOrEqual(4.5);
      expect(ratio('#FFFFFF', tintedBubble(accent, BUBBLE_DARK))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('conversation fences in blog prose', () => {
  test('promotes a conversation fence instead of routing it to the code box', () => {
    const fragments = splitBlogProse(
      [
        '<p>Before</p>',
        '<figure class="kg-card kg-code-card">',
        '<pre><code class="language-conversation">ann: hi</code></pre>',
        '</figure>',
      ].join('')
    );

    expect(fragments).toEqual([
      { kind: 'html', html: '<p>Before</p>' },
      { kind: 'conversation', source: 'ann: hi' },
    ]);
  });

  test('leaves other languages on the code path', () => {
    const fragments = splitBlogProse('<pre><code class="language-ts">const a = 1;</code></pre>');

    expect(fragments).toEqual([{ kind: 'code', code: 'const a = 1;', lang: 'ts' }]);
  });

  test('matches the language case-insensitively', () => {
    expect(isConversationLanguage('Conversation')).toBe(true);
    expect(isConversationLanguage('ts')).toBe(false);
  });
});
