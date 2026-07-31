// Who may be credited as a model co-author.
//
// Nothing here is hand-maintained. Provider and model names come from
// models.dev (github.com/sst/models.dev) via `bun run sync:models`, which writes
// the snapshot in ./generated. Re-run it when a credit names a model the
// registry does not know yet.
//
// The snapshot is only read in Astro frontmatter, which runs at build time on a
// prerendered blog — it never reaches the browser. Only the resolved name and
// one inlined mark land in the HTML.
//
// There is deliberately no role vocabulary. An earlier design had one, with a
// `pledgeSafe` flag per role picking which footer line a post got. It bought a
// closed set of twenty-two verbs that still could not describe what a model did
// on a given post, and a validator that could check the spelling of a claim but
// never its truth. The directive's `note` replaces all of it: the author writes
// the sentence.

import registry from './generated/model-registry.json';

export interface ResolvedModel {
  /** `provider/model`, as written in the directive. */
  id: string;
  /** Model display name, e.g. "Claude Opus 4.6". */
  name: string;
  providerId: string;
  /** Provider display name, e.g. "Anthropic". */
  providerName: string;
}

const providers: Record<string, { name: string; models: Record<string, string> }> =
  registry.providers;

/** Where the snapshot came from; surfaced in the "unknown model" build error. */
export const MODEL_REGISTRY_SOURCE = registry.source;

/**
 * Resolve a `provider/model` reference. Model ids are only unique within a
 * provider — `claude-opus-4-6` exists under `anthropic`, `google-vertex-anthropic`
 * and several resellers — so the provider is part of the reference rather than
 * something we guess.
 */
export function resolveAuthorshipModel(reference: string): ResolvedModel | null {
  const separator = reference.indexOf('/');
  if (separator <= 0 || separator === reference.length - 1) return null;

  const providerId = reference.slice(0, separator);
  const modelId = reference.slice(separator + 1);

  const provider = providers[providerId];
  if (!provider) return null;

  const name = provider.models[modelId];
  if (!name) return null;

  return { id: reference, name, providerId, providerName: provider.name };
}
