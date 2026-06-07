import * as cheerio from 'cheerio';
import { formatTime } from '@/features/mood/shared/utils';

export function addTooBigVideoTimestamp(content: string, datetime: string): string {
  const timeLabel = formatTime(datetime);
  if (!content || !timeLabel || !content.includes('video-too-big')) {
    return content;
  }

  const $ = cheerio.load(content, { decodeEntities: false }, false);
  const placeholders = $('.video-too-big');
  if (!placeholders.length) {
    return content;
  }

  placeholders.each((_index, element) => {
    const placeholder = $(element);
    if (placeholder.find('.video-too-big__timestamp').length) {
      return;
    }

    const timestamp = $('<time></time>');
    timestamp.attr('class', 'video-too-big__timestamp');
    timestamp.attr('datetime', datetime);
    timestamp.text(timeLabel);
    placeholder.append(timestamp);
  });

  return $.html();
}
