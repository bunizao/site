#!/usr/bin/env bun
// Regenerates contracts/directive-grammar.json: the attribute rules each
// directive card validates against, as data.
//
// This is for a consumer outside this repo — the Koenig editor fork at
// ~/Dev/Koenig (see plans/koenig-editor.md) — which vendors the file
// directly rather than depending on `site` as a package, the same way
// site-api vendors the comments contract. It therefore lives under the
// repo-root `contracts/` directory, not `packages/contracts`: that package
// is a published, version-pinned npm dependency of site-api, and this
// snapshot has no such consumer.
//
// Every rule below is re-exported from the directive module that enforces
// it (a TypeScript `Record` keyed by that module's own attribute-name
// tuple, so a renamed or added attribute fails to compile here) rather than
// retyped, so the JSON cannot drift from the validation the site actually
// runs. `export:directive-grammar -- --check` fails when the committed file
// does not match what the directives currently accept.
//
// Usage:
//   bun run export:directive-grammar              # regenerate the file
//   bun run export:directive-grammar -- --check    # fail if it is stale

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { listKnownAuthorshipModelIds, MODEL_REGISTRY_SOURCE } from '@/data/authorship';
import {
  AUTHORS_ATTRIBUTES,
} from '@/features/posts/server/directives/authors';
import {
  MOOD_ATTRIBUTES,
  MOOD_DENSITIES,
  MOOD_ID_RE,
  MOOD_THEMES,
} from '@/features/posts/server/directives/mood';
import { MUSIC_ATTRIBUTES, MUSIC_ID_RE } from '@/features/posts/server/directives/music';
import { POEM_FLAGS } from '@/features/posts/server/directives/poem';
import {
  YOUTUBE_ATTRIBUTES,
  YOUTUBE_START_RE,
} from '@/features/posts/server/directives/youtube';
import { MAX_YOUTUBE_START_SECONDS, YOUTUBE_VIDEO_ID_PATTERN } from '@/lib/embed/youtube';

export interface AttributeRule {
  required?: true;
  pattern?: string;
  enum?: readonly string[];
  max?: number;
  minLength?: number;
  freeText?: true;
  registry?: string;
  ids?: readonly string[];
}

export interface DirectiveGrammarEntry {
  kind: 'block' | 'meta' | 'inline';
  attributes: Record<string, AttributeRule>;
  flags?: readonly string[];
}

export type DirectiveGrammar = Record<string, DirectiveGrammarEntry>;

type AttributesOf<Names extends readonly string[]> = Record<Names[number], AttributeRule>;

export function buildDirectiveGrammar(): DirectiveGrammar {
  const moodAttributes: AttributesOf<typeof MOOD_ATTRIBUTES> = {
    id: { required: true, pattern: MOOD_ID_RE.source },
    theme: { enum: MOOD_THEMES },
    density: { enum: MOOD_DENSITIES },
  };

  const musicAttributes: AttributesOf<typeof MUSIC_ATTRIBUTES> = {
    id: { required: true, pattern: MUSIC_ID_RE.source },
  };

  const youtubeAttributes: AttributesOf<typeof YOUTUBE_ATTRIBUTES> = {
    id: { required: true, pattern: YOUTUBE_VIDEO_ID_PATTERN.source },
    start: { pattern: YOUTUBE_START_RE.source, max: MAX_YOUTUBE_START_SECONDS },
  };

  const authorsAttributes: AttributesOf<typeof AUTHORS_ATTRIBUTES> = {
    ai: { required: true, registry: 'authorship', ids: listKnownAuthorshipModelIds() },
    note: { minLength: 1 },
  };

  return {
    mood: { kind: 'block', attributes: moodAttributes },
    music: { kind: 'block', attributes: musicAttributes },
    youtube: { kind: 'block', attributes: youtubeAttributes },
    authors: { kind: 'meta', attributes: authorsAttributes },
    poem: {
      kind: 'inline',
      attributes: { title: { freeText: true } },
      flags: POEM_FLAGS,
    },
  };
}

/**
 * Decides accept/reject the same way `parseKeyValueAttributes` +
 * `rejectUnsupportedAttributes` + each directive's own checks do, from the
 * grammar data alone. Exists so a unit test can use each directive's real
 * `parse` as the oracle and prove this data cannot silently diverge from it.
 * Not used by the site at runtime — the directives keep validating
 * themselves; this is the fork's (and this file's own test's) reference
 * implementation.
 */
export function findGrammarViolation(
  entry: DirectiveGrammarEntry,
  attributes: Readonly<Record<string, string>>,
): string | null {
  const names = Object.keys(entry.attributes);
  const unsupported = Object.keys(attributes).find((name) => !names.includes(name));
  if (unsupported) return `unsupported attribute "${unsupported}"`;

  for (const name of names) {
    const rule = entry.attributes[name];
    const value = attributes[name];
    if (value === undefined) {
      if (rule.required) return `attribute "${name}" is required`;
      continue;
    }
    if (rule.freeText) continue;
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return `attribute "${name}" must be at least ${rule.minLength} characters`;
    }
    if (rule.pattern !== undefined && !new RegExp(rule.pattern, 'u').test(value)) {
      return `attribute "${name}" does not match the expected pattern`;
    }
    if (rule.enum && !rule.enum.includes(value)) {
      return `attribute "${name}" must be one of ${rule.enum.join(', ')}`;
    }
    if (rule.max !== undefined && Number(value) > rule.max) {
      return `attribute "${name}" exceeds the maximum of ${rule.max}`;
    }
    if (rule.ids && !rule.ids.includes(value)) {
      return `attribute "${name}" is not a known id`;
    }
  }
  return null;
}

export const OUTPUT_PATH = resolve('contracts/directive-grammar.json');

export function serializeDirectiveGrammar(grammar: DirectiveGrammar): string {
  return `${JSON.stringify(grammar, null, 2)}\n`;
}

async function main(): Promise<void> {
  const checkMode = process.argv.includes('--check');
  const grammar = buildDirectiveGrammar();
  const serialized = serializeDirectiveGrammar(grammar);

  if (checkMode) {
    const existing = await readFile(OUTPUT_PATH, 'utf8').catch(() => null);
    if (existing !== serialized) {
      console.error(
        `${OUTPUT_PATH} is stale (source: ${MODEL_REGISTRY_SOURCE}). `
          + 'Run `bun run export:directive-grammar` and commit the result.',
      );
      process.exit(1);
    }
    console.log(`${OUTPUT_PATH} is up to date.`);
    return;
  }

  await writeFile(OUTPUT_PATH, serialized, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

// Bun executes top-level scripts directly; guard so importing this module
// from a test never triggers a write.
if (import.meta.main) {
  await main();
}
