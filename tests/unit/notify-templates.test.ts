import { describe, expect, test } from 'bun:test';
import { buildMoodDigestEmail, buildMoodNotificationEmail } from '../../src/features/notify/server/templates';

describe('notify email templates', () => {
  test('mood notification renders safe rich preview html', () => {
    const email = buildMoodNotificationEmail({
      moodUrl: 'https://example.com/mood/700',
      unsubscribeUrl: 'https://example.com/unsubscribe',
      previewText: 'Plain fallback',
      previewHtml: '<blockquote onclick="bad()"><strong>Bold quote</strong><br><code>answer</code><a href="javascript:bad()">bad</a><a href="https://example.org">good</a></blockquote>',
      postId: '700',
      channelTitle: 'Levitating',
    });

    expect(email.html).toContain('email-rich-text');
    expect(email.html).toContain('email-quote');
    expect(email.html).toContain('<strong');
    expect(email.html).toContain('<code');
    expect(email.html).toContain('href="https://example.org/"');
    expect(email.html).not.toContain('onclick');
    expect(email.html).not.toContain('javascript:bad');
  });

  test('digest items render safe rich preview html', () => {
    const email = buildMoodDigestEmail({
      mode: 'daily',
      moodUrl: 'https://example.com/mood',
      unsubscribeUrl: 'https://example.com/unsubscribe',
      channelTitle: 'Levitating',
      posts: [
        {
          postId: '701',
          moodUrl: 'https://example.com/mood/701',
          previewText: 'Fallback digest',
          previewHtml: '<blockquote><strong>Digest quote</strong></blockquote>',
          timeLabel: '10:30',
          dateLabel: 'Mon, Feb 10',
        },
      ],
    });

    expect(email.html).toContain('email-rich-text');
    expect(email.html).toContain('Digest quote');
    expect(email.html).toContain('email-quote');
  });
});
