import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'bun:test';

import {
  buildDirectiveGrammar,
  findGrammarViolation,
  OUTPUT_PATH,
  serializeDirectiveGrammar,
} from '../../scripts/export-directive-grammar';
import { parseKeyValueAttributes } from '@/features/posts/server/directives/attributes';
import { authorsDirective } from '@/features/posts/server/directives/authors';
import type { DirectiveContext } from '@/features/posts/server/directives/types';
import { moodDirective } from '@/features/posts/server/directives/mood';
import { musicDirective } from '@/features/posts/server/directives/music';
import { youtubeDirective } from '@/features/posts/server/directives/youtube';

const context: DirectiveContext = {
  slug: 'directive-grammar-oracle',
  locale: 'en',
  outputTarget: 'web',
};

interface Case {
  raw: string;
  valid: boolean;
}

describe('directive grammar snapshot', () => {
  test('the committed contracts/directive-grammar.json matches the directives', async () => {
    const committed = await readFile(OUTPUT_PATH, 'utf8');
    expect(committed).toBe(serializeDirectiveGrammar(buildDirectiveGrammar()));
  });

  test('mood grammar accepts and rejects the same markers as moodDirective.parse', () => {
    const grammar = buildDirectiveGrammar().mood;
    const cases: Case[] = [
      { raw: 'id=482', valid: true },
      { raw: 'id=482 theme=dark density=compact', valid: true },
      { raw: 'id=482 theme=auto', valid: true },
      { raw: 'id=0', valid: false },
      { raw: 'id=abc', valid: false },
      { raw: '', valid: false },
      { raw: 'id=482 theme=neon', valid: false },
      { raw: 'id=482 density=loose', valid: false },
      { raw: 'id=482 bogus=1', valid: false },
    ];

    for (const { raw, valid } of cases) {
      const attributes = parseKeyValueAttributes(raw);
      expect(findGrammarViolation(grammar, attributes) === null).toBe(valid);
      expect(runs(() => moodDirective.parse(raw))).toBe(valid);
    }
  });

  test('music grammar accepts and rejects the same markers as musicDirective.parse', () => {
    const grammar = buildDirectiveGrammar().music;
    const cases: Case[] = [
      { raw: 'id=1888707290', valid: true },
      { raw: 'id=0', valid: false },
      { raw: 'id=12a', valid: false },
      { raw: '', valid: false },
      { raw: 'id=1888707290 bogus=1', valid: false },
    ];

    for (const { raw, valid } of cases) {
      const attributes = parseKeyValueAttributes(raw);
      expect(findGrammarViolation(grammar, attributes) === null).toBe(valid);
      expect(runs(() => musicDirective.parse(raw))).toBe(valid);
    }
  });

  test('youtube grammar accepts and rejects the same markers as youtubeDirective.parse', () => {
    const grammar = buildDirectiveGrammar().youtube;
    const cases: Case[] = [
      { raw: 'id=dQw4w9WgXcQ', valid: true },
      { raw: 'id=dQw4w9WgXcQ start=30', valid: true },
      { raw: 'id=dQw4w9WgXcQ start=0', valid: true },
      { raw: 'id=short', valid: false },
      { raw: 'id=dQw4w9WgXcQ start=abc', valid: false },
      { raw: 'id=dQw4w9WgXcQ start=99999999', valid: false },
      { raw: '', valid: false },
    ];

    for (const { raw, valid } of cases) {
      const attributes = parseKeyValueAttributes(raw);
      expect(findGrammarViolation(grammar, attributes) === null).toBe(valid);
      expect(runs(() => youtubeDirective.parse(raw))).toBe(valid);
    }
  });

  test('authors grammar accepts and rejects the same markers as authorsDirective.parse', () => {
    const grammar = buildDirectiveGrammar().authors;
    const cases: Case[] = [
      { raw: 'ai=anthropic/claude-opus-4-5', valid: true },
      { raw: 'ai=anthropic/claude-opus-4-5 note=hello', valid: true },
      { raw: 'ai=totally/unknown-model', valid: false },
      { raw: '', valid: false },
      { raw: 'ai=anthropic/claude-opus-4-5 note=""', valid: false },
      { raw: 'ai=anthropic/claude-opus-4-5 bogus=1', valid: false },
    ];

    for (const { raw, valid } of cases) {
      const attributes = parseKeyValueAttributes(raw);
      expect(findGrammarViolation(grammar, attributes) === null).toBe(valid);
      expect(runs(() => authorsDirective.parse(raw, context))).toBe(valid);
    }
  });
});

function runs(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}
