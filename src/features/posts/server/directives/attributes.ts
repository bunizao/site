import type { DirectiveAttributes } from './types';

const ATTRIBUTE_RE = /([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/iy;

export class DirectiveAttributeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectiveAttributeError';
  }
}

export function parseKeyValueAttributes(rawAttributes: string): DirectiveAttributes {
  const attributes: DirectiveAttributes = {};
  let cursor = 0;

  while (cursor < rawAttributes.length) {
    const whitespace = rawAttributes.slice(cursor).match(/^\s+/u)?.[0] ?? '';
    cursor += whitespace.length;
    if (cursor >= rawAttributes.length) break;

    ATTRIBUTE_RE.lastIndex = cursor;
    const match = ATTRIBUTE_RE.exec(rawAttributes);
    if (!match) {
      throw new DirectiveAttributeError('attributes must use key=value syntax.');
    }

    const name = match[1].toLowerCase();
    if (Object.hasOwn(attributes, name)) {
      throw new DirectiveAttributeError(`duplicate attribute "${name}".`);
    }
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
    cursor = ATTRIBUTE_RE.lastIndex;
  }

  return attributes;
}

export function rejectUnsupportedAttributes(
  attributes: DirectiveAttributes,
  supportedNames: readonly string[],
): void {
  const supported = new Set(supportedNames);
  const unsupported = Object.keys(attributes).find((name) => !supported.has(name));
  if (unsupported) {
    throw new DirectiveAttributeError(`unsupported attribute "${unsupported}".`);
  }
}
