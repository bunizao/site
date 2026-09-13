import { expect, test } from 'bun:test';
import { load } from 'cheerio';
import { renderToStaticMarkup } from 'react-dom/server';
import BanDialog from '@/features/admin/ui/BanDialog';
import SourceRows from '@/features/admin/ui/SourceRows';
import { DEMO_COMMENTS } from '@/features/admin/server/portal-demo';

function actor(verified: boolean) {
  const value = structuredClone(DEMO_COMMENTS.comments[0]!.actor);
  value.readerId = verified ? 'reader-confirmed' : null;
  value.keys.email = 'email-claimed';
  value.keys.emailDomain = 'example.com';
  value.emailDomainPublishedComments = 11;
  return value;
}

function selectedKeyLabels(markup: string): string[] {
  const $ = load(markup);
  return $('.portal-ban__keys li').filter((_, element) => $(element).find('[role="checkbox"][aria-checked="true"]').length > 0)
    .find('.portal-actor__key-label').map((_, element) => $(element).text()).get();
}

const callbacks = { onClose() {}, onDone() {} };

test('default ban selection covers only the session and confirmed email', () => {
  for (const verified of [false, true]) {
    const markup = renderToStaticMarkup(<BanDialog actor={actor(verified)} {...callbacks} />);
    const $ = load(markup);
    expect(selectedKeyLabels(markup)).toEqual(verified ? ['session', 'email'] : ['session']);
    expect($('#ban-expiry option[selected]').val()).toBe('7');
    expect($('.portal-ban__warn').text()).toContain('fingerprints can collide');
    expect($('.portal-ban__keys li').filter((_, element) => $(element).text().includes('mail domain'))
      .find('[role="checkbox"][aria-disabled="true"]').length).toBe(1);
    expect(markup).toContain('11 published comments');
  }
});

test('an unavailable email-domain count disables the broad ban', () => {
  const value = actor(false);
  value.emailDomainPublishedComments = null;
  const $ = load(renderToStaticMarkup(<BanDialog actor={value} {...callbacks} />));
  expect($('.portal-ban__keys li').filter((_, element) => $(element).text().includes('mail domain'))
    .find('[role="checkbox"][aria-disabled="true"]').length).toBe(1);
  expect($('.portal-ban__warn').text()).toContain('count could not be loaded');
});

test('a pivot dialog offers exactly the viewed key without account controls', () => {
  const $ = load(renderToStaticMarkup(<BanDialog source={{ type: 'ip24', value: 'subnet-viewed' }} {...callbacks} />));
  expect($('.portal-ban__keys li')).toHaveLength(1);
  expect($('.portal-ban__keys').text()).toContain('subnet-viewed');
  expect($('[role="checkbox"][aria-checked="true"]')).toHaveLength(0);
  expect($.text()).not.toContain('Ban the account too');
});

test('non-bannable source profiles offer no misleading ban button', () => {
  for (const type of ['storage_id', 'body_hash'] as const) {
    const $ = load(renderToStaticMarkup(<SourceRows source={{ type, value: 'viewed' }}
      comments={DEMO_COMMENTS.comments} reactions={[]} />));
    expect($('button').filter((_, element) => $(element).text().includes('Ban this source'))).toHaveLength(0);
  }
});
