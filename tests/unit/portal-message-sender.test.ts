/* The message pane's Sender section: who the meta line says sent it, what
   each key's count link says, and which rows show. Only a signed-in write
   names a reader; a typed address never does. */
import { describe, expect, test } from 'bun:test';
import type { AdminOwnerMessage } from '@bunizao/contracts';
import { demoActor } from '@/features/admin/server/portal-demo';
import { senderLabel, senderRows, tally } from '@/features/portal/messages/model';

function message(overrides: Partial<AdminOwnerMessage> = {}): AdminOwnerMessage {
  return {
    id: 'm1', state: 'new', displayName: 'Mira', body: 'Hello there.', locale: 'en',
    readerId: null, emailHash: null, spamNote: null, spamModel: null, repliedAt: null,
    country: 'DE', createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('senderLabel', () => {
  test('says signed-in reader only for a signed-in write', () => {
    expect(senderLabel(message({ readerId: 'reader-1', emailHash: 'h', authAtWrite: 'verified' }))).toBe('Signed-in reader');
    expect(senderLabel(message({ readerId: 'reader-1', emailHash: 'h', authAtWrite: 'anonymous' }))).toBe('Typed a reader’s address');
    // A row from before site-api recorded it claims neither.
    expect(senderLabel(message({ readerId: 'reader-1', emailHash: 'h' }))).toBe('A reader’s address');
    expect(senderLabel(message({ readerId: 'reader-1', emailHash: 'h', authAtWrite: 'unknown' }))).toBe('A reader’s address');
    expect(senderLabel(message({ emailHash: 'h', authAtWrite: 'anonymous' }))).toBe('Gave an address');
    expect(senderLabel(message())).toBe('No address');
  });
});

describe('tally', () => {
  test('counts what shares a key, this message included, one line a kind', () => {
    expect(tally({ comments: 3, held: 1, reactions: 0, messages: 2 })).toEqual(['3 comments', '3 messages']);
    expect(tally({ comments: 1, held: 0, reactions: 2, messages: 0 })).toEqual(['1 comment', '2 reactions']);
    expect(tally({ comments: 0, held: 0, reactions: 0, messages: 1 })).toEqual(['2 messages']);
  });

  test('null when this message is alone, undefined when nothing counted', () => {
    expect(tally({ comments: 0, held: 0, reactions: 0, messages: 0 })).toBeNull();
    // A site-api without message counts still counts the others.
    expect(tally({ comments: 0, held: 0, reactions: 0 })).toBeNull();
    expect(tally(undefined)).toBeUndefined();
  });
});

describe('senderRows', () => {
  const actor = demoActor({
    email: 'mira.k@example.de',
    browser: 'Firefox 131',
    os: 'macOS',
    asn: 3320,
    asOrg: 'Deutsche Telekom',
    keys: { email: 'hash-mira', clientFp: 'fp-mira', emailDomain: null, bodyHash: null },
    cluster: { email: { comments: 0, held: 0, reactions: 0, messages: 3 }, clientFp: { comments: 2, held: 0, reactions: 0, messages: 0 } },
  });

  test('name, address, device and network lead; keys the message lacks are left out', () => {
    const rows = senderRows(message({ emailHash: 'hash-mira', authAtWrite: 'verified' }), actor);
    expect(rows.map((row) => row.id)).toEqual(['name', 'email', 'device', 'asn', 'session', 'clientFp', 'ip', 'fp', 'ip24']);
    expect(rows.find((row) => row.id === 'device')?.value).toBe('Firefox 131 on macOS');
    expect(rows.find((row) => row.id === 'asn')?.value).toBe('AS3320 Deutsche Telekom');
    const email = rows.find((row) => row.id === 'email')!;
    expect(email).toMatchObject({ label: 'Signed-in address', value: 'mira.k@example.de', tally: ['4 messages'], pivot: { type: 'email', value: 'hash-mira' } });
    expect(rows.find((row) => row.id === 'clientFp')?.tally).toEqual(['2 comments']);
    expect(rows.find((row) => row.id === 'session')?.tally).toBeNull();
  });

  test('a typed address is labelled as typed, and never as the reader it resolves to', () => {
    const typed = senderRows(message({ emailHash: 'hash-mira', readerId: 'reader-1', authAtWrite: 'anonymous' }), actor);
    const email = typed.find((row) => row.id === 'email')!;
    expect(email.label).toBe('Typed address');
    expect(email.explain).toContain('Anybody can type any address');
    // An older row is neither.
    expect(senderRows(message({ emailHash: 'hash-mira' }), actor).find((row) => row.id === 'email')?.label).toBe('Address');
  });
});
