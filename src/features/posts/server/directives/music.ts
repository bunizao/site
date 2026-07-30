import {
  enrichAppleMusicEmbeds,
  resolveAppleMusicTrackLink,
} from '../apple-music';
import {
  DirectiveAttributeError,
  parseKeyValueAttributes,
  rejectUnsupportedAttributes,
} from './attributes';
import type {
  BlockDirective,
  DirectiveAttributes,
  DirectiveOutputTarget,
} from './types';

const RICH_TARGETS: ReadonlySet<DirectiveOutputTarget> = new Set(['web', 'preview']);

function appleMusicEmbedUrl(id: string): string {
  return `https://embed.music.apple.com/us/song/${id}?i=${id}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function renderAppleMusicLink(
  id: string,
  resolved?: { title: string; url: string } | null,
): string {
  const href = escapeHtml(resolved?.url ?? appleMusicEmbedUrl(id));
  const label = resolved?.title
    ? `Listen to ${escapeHtml(resolved.title)} on Apple Music`
    : 'Listen on Apple Music';
  return `<p><a href="${href}">${label}</a></p>`;
}

function parseMusicAttributes(rawAttributes: string): DirectiveAttributes {
  const attributes = parseKeyValueAttributes(rawAttributes);
  rejectUnsupportedAttributes(attributes, ['id']);
  if (!/^[1-9]\d*$/u.test(attributes.id ?? '')) {
    throw new DirectiveAttributeError('attribute "id" must be a positive integer.');
  }
  return attributes;
}

async function renderMusicDirective(
  attributes: DirectiveAttributes,
  outputTarget: DirectiveOutputTarget,
): Promise<string> {
  const id = attributes.id;
  if (!RICH_TARGETS.has(outputTarget)) {
    return renderAppleMusicLink(id, await resolveAppleMusicTrackLink(id));
  }

  const source = `<iframe src="${appleMusicEmbedUrl(id)}"></iframe>`;
  const enriched = await enrichAppleMusicEmbeds(source);
  return enriched === source ? renderAppleMusicLink(id) : enriched;
}

export const musicDirective: BlockDirective = {
  name: 'music',
  kind: 'block',
  parse: parseMusicAttributes,
  render: (attributes, context) => renderMusicDirective(attributes, context.outputTarget),
};
