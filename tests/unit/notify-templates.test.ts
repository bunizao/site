import { describe, expect, test } from 'bun:test';
import * as cheerio from 'cheerio';
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
    expect(email.html).toContain('email-digest-content');
    expect(email.html).toContain('border-left: 1px solid #ececec');
    expect(email.html).toContain('.email-digest-content { border-color: #242424 !important; }');
    expect(email.html).not.toContain('border-top: 1px solid #efefef');
  });

  test('mood notification renders bookmark cards with wrapping text styles', () => {
    const email = buildMoodNotificationEmail({
      moodUrl: 'https://example.com/mood/3415',
      unsubscribeUrl: 'https://example.com/unsubscribe',
      previewText: 'Plain fallback',
      previewHtml: [
        '<a class="bookmark-card" href="https://example.org/article" onclick="bad()">',
        '<span class="bookmark-card__content">',
        '<span class="bookmark-card__title">A very long bookmark title that should wrap instead of staying on one line</span>',
        '<span class="bookmark-card__description">A useful link description that needs more than one line in the newsletter card.</span>',
        '<span class="bookmark-card__meta">example.org</span>',
        '</span>',
        '</a>',
      ].join(''),
      postId: '3415',
      channelTitle: 'Levitating',
    });

    expect(email.html).toContain('email-bookmark-card');
    expect(email.html).toContain('email-bookmark-title');
    expect(email.html).toContain('email-bookmark-description');
    expect(email.html).toContain('text-transform: uppercase');
    expect(email.html).toContain('overflow-wrap: break-word');
    expect(email.html).not.toContain('white-space: nowrap');
    expect(email.html).not.toContain('onclick');
  });

  test('digest bookmark previews do not duplicate the same link as media and related links', () => {
    const email = buildMoodDigestEmail({
      mode: 'daily',
      moodUrl: 'https://example.com/mood',
      unsubscribeUrl: 'https://example.com/unsubscribe',
      channelTitle: 'Levitating',
      posts: [
        {
          postId: '3415',
          moodUrl: 'https://example.com/mood/3415',
          previewText: 'https://whoami.wiki/ 有意思',
          previewHtml: [
            '<a href="https://whoami.wiki/">https://whoami.wiki/</a>',
            '<br />',
            '有意思',
            '<a class="bookmark-card" href="https://whoami.wiki/">',
            '<span class="bookmark-card__content">',
            '<span class="bookmark-card__title">whoami.wiki</span>',
            '<span class="bookmark-card__description">your personal encyclopedia, written by agents</span>',
            '<span class="bookmark-card__meta">whoami.wiki</span>',
            '</span>',
            '</a>',
          ].join(''),
          relatedLinks: [
            { url: 'https://image.buxx.me/mood/3415/0', type: 'image' },
            { url: 'https://whoami.wiki/%E6%9C%89%E6%84%8F%E6%80%9D', type: 'link' },
            { url: 'https://whoami.wiki/', type: 'link' },
          ],
          timeLabel: '18:34',
          dateLabel: 'Wed, Apr 29',
        },
      ],
    });

    const $ = cheerio.load(email.html);
    expect($('.email-bookmark-card').length).toBe(1);
    expect($('img[alt="Mood image"]').length).toBe(0);
    expect($('.email-meta').filter((_index, element) => $(element).text().trim() === 'Links').length).toBe(0);
    expect($('a.email-link').filter((_index, element) => $(element).text().trim() === 'https://whoami.wiki/').length).toBe(0);
    expect($('.email-rich-text').html()?.trim().startsWith('<br')).toBe(false);
    expect($('.email-rich-text').text().trim().startsWith('有意思')).toBe(true);
  });
});
