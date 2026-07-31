import {
  isYouTubeVideoId,
  renderYouTubeEmbedMarkup,
  youtubeWatchUrl,
} from '@/lib/embed/youtube';

import {
  DirectiveAttributeError,
  parseKeyValueAttributes,
  rejectUnsupportedAttributes,
} from './attributes';
import { isRichDirectiveOutputTarget } from './types';
import type { BlockDirective, DirectiveAttributes } from './types';

const MAX_START_SECONDS = 7 * 24 * 60 * 60;

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
}

function parseYouTubeAttributes(rawAttributes: string): DirectiveAttributes {
  const attributes = parseKeyValueAttributes(rawAttributes);
  rejectUnsupportedAttributes(attributes, ['id', 'start']);

  if (!isYouTubeVideoId(attributes.id ?? '')) {
    throw new DirectiveAttributeError('attribute "id" must be an 11-character YouTube video ID.');
  }
  if (
    attributes.start !== undefined
    && (!/^\d+$/u.test(attributes.start) || Number(attributes.start) > MAX_START_SECONDS)
  ) {
    throw new DirectiveAttributeError(
      `attribute "start" must be an integer from 0 to ${MAX_START_SECONDS}.`,
    );
  }

  return attributes;
}

export const youtubeDirective: BlockDirective = {
  name: 'youtube',
  kind: 'block',
  parse: parseYouTubeAttributes,
  render(attributes, context) {
    const id = attributes.id;
    const startSeconds = Number(attributes.start ?? 0);
    const watchUrl = youtubeWatchUrl(id, startSeconds);

    if (!isRichDirectiveOutputTarget(context.outputTarget)) {
      return `<p><a href="${escapeHtml(watchUrl)}">Watch this video on YouTube</a></p>`;
    }

    return renderYouTubeEmbedMarkup({
      id,
      startSeconds,
      title: 'YouTube video',
      channelName: 'YouTube',
    });
  },
};
