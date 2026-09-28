import { describe, expect, test } from 'bun:test';
import type { AdminCommentRecord, AdminCommentStatus } from '@bunizao/contracts';
import { demoActor } from '../../src/features/admin/server/portal-demo';
import type { CommentAdminStore } from '../../src/features/portal/server/demo/comment-admin';
import { handleCommentControlsDemo } from '../../src/features/portal/server/demo/controls';
import { sourceProfile } from '../../src/features/portal/server/demo/comments';
import { handleMessagesDemo, messagesMatching, seedMessages, type MessagesStore } from '../../src/features/portal/server/demo/messages';
import { handleCommentModesDemo, seedModes, type DemoModePost, type ModesStore } from '../../src/features/portal/server/demo/modes';
import { handleReadersDemo, seedReaders, type ReadersStore } from '../../src/features/portal/server/demo/readers';

/* The P6 demo routes against site-api's rules: the message state machine
   and reply refusals, revoked-reader restore, per-post mode precedence, and
   pin/lock. Every test builds its own store. */

type Handler = (request: Request, segments: string[]) => Promise<Response | null>;

async function call(handler: Handler, method: string, path: string, body?: unknown) {
  const url = new URL(`http://localhost/dev/portal/api/admin/${path}`);
  const segments = url.pathname.split('/').slice(5).filter(Boolean).map(decodeURIComponent);
  const request = new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const response = await handler(request, segments);
  if (!response) throw new Error(`no demo answer for ${method} ${path}`);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

/* ------------------------------------------------------------------ */

describe('portal demo: owner messages', () => {
  const messages = (store: MessagesStore): Handler => (request, segments) => handleMessagesDemo(request, segments, [], store);
  const idOf = (store: MessagesStore, predicate: (message: MessagesStore['messages'][number]) => boolean) =>
    store.messages.find(predicate)!.id;

  test('the list filters by state, counts the whole inbox and pages', async () => {
    const store = seedMessages();
    const all = await call(messages(store), 'GET', 'messages?limit=5');
    expect(all.status).toBe(200);
    expect(all.body.messages).toHaveLength(5);
    expect(all.body.total).toBe(store.messages.length);
    expect(all.body.nextOffset).toBe(5);
    const counted = Object.values(all.body.counts as Record<string, number>).reduce((sum, n) => sum + n, 0);
    expect(counted).toBe(store.messages.length);

    const spam = await call(messages(store), 'GET', 'messages?state=spam&limit=100');
    expect(spam.body.messages.every((message: { state: string }) => message.state === 'spam')).toBe(true);
    expect(spam.body.total).toBe(all.body.counts.spam);
    expect(spam.body.counts).toEqual(all.body.counts);
    expect(spam.body.nextOffset).toBeNull();
    const times = all.body.messages.map((message: { createdAt: string }) => message.createdAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  test('state=inbox reads new, read and replied together, and nothing archived or spam', async () => {
    const store = seedMessages();
    const archived = store.messages.find((message) => message.state === 'read')!;
    archived.state = 'archived';
    const inbox = await call(messages(store), 'GET', 'messages?state=inbox&limit=100');
    expect(inbox.status).toBe(200);
    const states = new Set(inbox.body.messages.map((message: { state: string }) => message.state));
    expect([...states].every((state) => state === 'new' || state === 'read' || state === 'replied')).toBe(true);
    expect(inbox.body.messages.some((message: { id: string }) => message.id === archived.id)).toBe(false);
    const { counts } = inbox.body as { counts: Record<string, number> };
    expect(inbox.body.total).toBe(counts.new + counts.read + counts.replied);
    // The counts still cover the whole inbox.
    expect(counts.archived).toBeGreaterThan(0);
    expect(counts.spam).toBeGreaterThan(0);
  });

  test('a bad state, limit or offset is a 400', async () => {
    const store = seedMessages();
    expect((await call(messages(store), 'GET', 'messages?state=unread')).body.error).toBe('invalid_state');
    expect((await call(messages(store), 'GET', 'messages?limit=101')).body.error).toBe('invalid_limit');
    expect((await call(messages(store), 'GET', 'messages?limit=0')).body.error).toBe('invalid_limit');
    expect((await call(messages(store), 'GET', 'messages?offset=-1')).body.error).toBe('invalid_offset');
  });

  test('detail says who a reply reaches, and lists the same address newest first', async () => {
    const store = seedMessages();
    const mira = store.messages.filter((message) => message.displayName === 'Mira');
    const detail = await call(messages(store), 'GET', `messages/${mira[0].id}`);
    expect(detail.body.sender).toEqual({ replyable: 'ok', email: 'mira.k@example.de', readerId: 'reader-3f9a1c' });
    // By address, not by name: whoever typed it is in the history too.
    const sameAddress = store.messages.filter((message) => message.emailHash === mira[0].emailHash && message.id !== mira[0].id);
    expect(sameAddress.some((message) => message.displayName !== 'Mira')).toBe(true);
    expect(detail.body.history.map((message: { id: string }) => message.id)).toEqual(sameAddress.map((message) => message.id));

    const reasons = async (name: string) =>
      (await call(messages(store), 'GET', `messages/${idOf(store, (message) => message.displayName === name)}`)).body.sender;
    expect(await reasons('A reader')).toEqual({ replyable: 'no_address', email: null, readerId: null });
    expect((await reasons('小林')).replyable).toBe('unverified');
    // A revoked reader cannot be answered either.
    expect((await reasons('tomasz')).replyable).toBe('unverified');
    expect((await reasons('Priya')).replyable).toBe('suppressed');
    // No address, no history.
    const anonymous = await call(messages(store), 'GET', `messages/${idOf(store, (message) => message.emailHash === null)}`);
    expect(anonymous.body.history).toEqual([]);

    expect((await call(messages(store), 'GET', 'messages/missing')).status).toBe(404);
  });

  test('the five acts follow the guarded state machine', async () => {
    const store = seedMessages();
    const fresh = idOf(store, (message) => message.state === 'new');
    const act = (id: string, action: string) => call(messages(store), 'POST', `messages/${id}`, { action });

    expect((await act(fresh, 'read')).body).toMatchObject({ changed: true, message: { state: 'read' } });
    expect((await act(fresh, 'read')).body).toMatchObject({ changed: false, message: { state: 'read' } });
    expect((await act(fresh, 'archive')).body.message.state).toBe('archived');
    expect((await act(fresh, 'unarchive')).body.message.state).toBe('read');
    expect((await act(fresh, 'unarchive')).body.changed).toBe(false);
    expect((await act(fresh, 'spam')).body.message.state).toBe('spam');
    expect((await act(fresh, 'unspam')).body.message.state).toBe('read');

    // Back to replied, not read, when it was ever answered.
    const answered = idOf(store, (message) => message.state === 'replied');
    await act(answered, 'archive');
    expect((await act(answered, 'unarchive')).body.message.state).toBe('replied');
    await act(answered, 'spam');
    expect((await act(answered, 'unspam')).body.message.state).toBe('replied');

    expect((await act(fresh, 'delete')).body.error).toBe('invalid_action');
    expect((await act('missing', 'read')).status).toBe(404);
  });

  test('a reply is refused for each unreachable sender and files the message as replied', async () => {
    const store = seedMessages();
    const send = (id: string, body: unknown) => call(messages(store), 'POST', `messages/${id}/reply`, { body });
    const byName = (name: string) => idOf(store, (message) => message.displayName === name);

    expect((await send(byName('Mira'), ' x ')).body.error).toBe('invalid_body');
    expect((await send(byName('Mira'), 'x'.repeat(4001))).body.error).toBe('invalid_body');
    expect((await send(byName('Mira'), 42)).body.error).toBe('invalid_body');
    expect((await send('missing', 'Thanks!')).body.error).toBe('message_not_found');
    for (const [name, reason] of [['A reader', 'no_address'], ['小林', 'unverified'], ['Priya', 'suppressed']]) {
      const refused = await send(byName(name), 'Thanks!');
      expect([refused.status, refused.body.error]).toEqual([409, reason]);
    }

    const sent = await send(byName('Mira'), '  Of course, go ahead.  ');
    expect(sent.status).toBe(200);
    expect(sent.body.recipientName).toBe('Mira');
    expect(sent.body.recipientEmail).toBe('m***@example.de');
    expect(sent.body.message.state).toBe('replied');
    expect(sent.body.message.repliedAt).toBeString();
  });

  test('an address typed signed out resolves to its reader, but the sender is not them', async () => {
    const store = seedMessages();
    const typed = store.messages.find((message) => message.displayName === 'Mira K.')!;
    const signedIn = store.messages.find((message) => message.displayName === 'Mira')!;
    expect(typed).toMatchObject({ emailHash: signedIn.emailHash, readerId: 'reader-3f9a1c', authAtWrite: 'anonymous' });
    expect(signedIn.authAtWrite).toBe('verified');

    const { body } = await call(messages(store), 'GET', `messages/${typed.id}`);
    expect(body.message.authAtWrite).toBe('anonymous');
    expect(body.actor).toMatchObject({ readerId: null, authAtWrite: 'anonymous', email: 'mira.k@example.de' });
    expect(body.actor.keys.email).toBe(typed.emailHash);
    // Nothing of Mira's device: only the address is shared.
    const mira = store.actors.get(signedIn.id)!;
    expect(body.actor.keys.clientFp).not.toBe(mira.keys.clientFp);
    expect(body.actor.keys.session).not.toBe(mira.keys.session);
  });

  test('the sender block counts comments and other messages on each key', async () => {
    const store = seedMessages();
    const mira = store.messages.filter((message) => message.displayName === 'Mira');
    const actor = store.actors.get(mira[0].id)!;
    const comment = (status: AdminCommentStatus, clientFp: string | null) =>
      ({ id: `c-${status}`, status, actor: demoActor({ keys: { clientFp } }) }) as AdminCommentRecord;
    const comments = [comment('published', actor.keys.clientFp), comment('held', actor.keys.clientFp), comment('published', 'someone-else')];
    const handler: Handler = (request, segments) => handleMessagesDemo(request, segments, comments, store);

    const { body } = await call(handler, 'GET', `messages/${mira[0].id}`);
    // Her other two messages share the device; this one is not counted.
    expect(body.actor.cluster.clientFp).toEqual({ comments: 2, held: 1, reactions: 0, messages: mira.length - 1 });
    // The address also reaches the message typed with it.
    expect(body.actor.cluster.email.messages).toBe(mira.length);
    expect(body.actor.cluster.email.comments).toBe(0);
    // A message with no actor, as from a site-api that predates it, has no block.
    store.actors.delete(mira[1].id);
    expect((await call(handler, 'GET', `messages/${mira[1].id}`)).body).not.toHaveProperty('actor');
  });

  test('a pivot profile lists addresses by how they were written and devices across comments and messages', async () => {
    const store = seedMessages();
    const signedIn = store.messages.find((message) => message.displayName === 'Mira')!;
    const typed = store.messages.find((message) => message.displayName === 'Mira K.')!;
    const device = store.actors.get(signedIn.id)!.keys.clientFp!;
    const comment = {
      id: 'c-1', status: 'published', createdAt: new Date(0).toISOString(),
      actor: demoActor({ authAtWrite: 'verified', email: 'mira@posteo.de', browser: 'Firefox 131', os: 'macOS', keys: { clientFp: device, email: 'posteo-hash' } }),
    } as AdminCommentRecord;

    // One device: both of her addresses, each confirmed, and the device itself.
    const byDevice = sourceProfile('client_fp', device, [comment], messagesMatching('client_fp', device, store));
    expect(byDevice.messages?.total).toBe(3);
    expect(byDevice.messages?.byState.new).toBe(1);
    expect(byDevice.addresses?.map(({ email, confirmed, comments, messages: sent }) => ({ email, confirmed, comments, messages: sent }))).toEqual([
      { email: 'mira.k@example.de', confirmed: true, comments: 0, messages: 3 },
      { email: 'mira@posteo.de', confirmed: true, comments: 1, messages: 0 },
    ]);
    expect(byDevice.devices).toEqual([
      expect.objectContaining({ clientFp: device, browser: 'Firefox 131', os: 'macOS', comments: 1, messages: 3 }),
    ]);

    // One address: her device and the one that typed it.
    const byAddress = sourceProfile('email', typed.emailHash!, [], messagesMatching('email', typed.emailHash!, store));
    expect(byAddress.messages?.total).toBe(4);
    expect(byAddress.devices?.map((entry) => [entry.os, entry.messages])).toEqual([['macOS', 3], ['Windows', 1]]);

    // An address nobody signed in with stays typed.
    const kobayashi = store.messages.find((message) => message.displayName === '小林')!;
    const typedOnly = sourceProfile('email', kobayashi.emailHash!, [], messagesMatching('email', kobayashi.emailHash!, store));
    expect(typedOnly.addresses).toEqual([expect.objectContaining({ confirmed: false, messages: 2 })]);
  });

  test('a reply to an archived message leaves it archived', async () => {
    const store = seedMessages();
    const archived = store.messages.find((message) => message.state === 'archived' && message.displayName === 'Sam Carter')!;
    const sent = await call(messages(store), 'POST', `messages/${archived.id}/reply`, { body: 'Late, but thank you.' });
    expect(sent.status).toBe(200);
    expect(sent.body.message.state).toBe('archived');
    expect(sent.body.message.repliedAt).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('portal demo: revoked readers', () => {
  const readers = (store: ReadersStore): Handler => (request, segments) => handleReadersDemo(request, segments, store);

  test('lists revoked readers newest first; a restore takes one off, once', async () => {
    const store = seedReaders(Date.now(), 'feedface00000001');
    const listed = await call(readers(store), 'GET', 'readers/revoked');
    const rows = listed.body.readers as Array<{ readerId: string; updatedAt: string; emailHash: string }>;
    expect(rows).toHaveLength(4);
    expect(rows[0].emailHash).toBe('feedface00000001');
    expect(rows.map((row) => row.updatedAt)).toEqual(rows.map((row) => row.updatedAt).sort().reverse());
    expect(Object.keys(rows[0])).not.toContain('banned');

    const restored = await call(readers(store), 'POST', `readers/${rows[1].readerId}/restore`);
    expect(restored.body).toMatchObject({ readerId: rows[1].readerId });
    expect((await call(readers(store), 'GET', 'readers/revoked')).body.readers).toHaveLength(3);

    const again = await call(readers(store), 'POST', `readers/${rows[1].readerId}/restore`);
    expect([again.status, again.body.error]).toEqual([409, 'reader_not_revoked']);
    expect((await call(readers(store), 'POST', 'readers/nobody/restore')).status).toBe(409);
  });
});

/* ------------------------------------------------------------------ */

describe('portal demo: per-post comment modes', () => {
  const POSTS: DemoModePost[] = [
    { surface: 'blog', postId: 'b1', title: 'Tagged off', slug: 'tagged-off', tagMode: 'off' },
    { surface: 'blog', postId: 'b2', title: 'Open by tags', slug: 'open', tagMode: 'open' },
    { surface: 'mood', postId: '2841', title: 'Balcony', slug: '2841', tagMode: 'open' },
  ];
  const fresh = (): ModesStore => ({ posts: POSTS, overrides: new Map() });
  const modes = (store: ModesStore): Handler => (request, segments) => handleCommentModesDemo(request, segments, [], store);

  test('an override replaces the tag mode outright and DELETE hands it back', async () => {
    const store = fresh();
    const set = await call(modes(store), 'PUT', 'comment-modes/blog/b1', { mode: 'open' });
    expect(set.body.mode).toMatchObject({ override: 'open', tagMode: 'off', effectiveMode: 'open', title: 'Tagged off' });
    expect(set.body.mode.updatedAt).toBeString();

    const read = await call(modes(store), 'GET', 'comment-modes/blog/b1');
    expect(read.body.mode.effectiveMode).toBe('open');

    const cleared = await call(modes(store), 'DELETE', 'comment-modes/blog/b1');
    expect(cleared.body.mode).toMatchObject({ override: null, tagMode: 'off', effectiveMode: 'off', updatedAt: null });
    expect((await call(modes(store), 'GET', 'comment-modes')).body.modes).toEqual([]);
  });

  test('the list holds every override, ordered by surface then post', async () => {
    const store = fresh();
    await call(modes(store), 'PUT', 'comment-modes/mood/2841', { mode: 'readonly' });
    await call(modes(store), 'PUT', 'comment-modes/blog/b2', { mode: 'off' });
    await call(modes(store), 'PUT', 'comment-modes/blog/b1', { mode: 'readonly' });
    const listed = await call(modes(store), 'GET', 'comment-modes');
    expect(listed.body.modes.map((mode: { surface: string; postId: string }) => `${mode.surface}/${mode.postId}`))
      .toEqual(['blog/b1', 'blog/b2', 'mood/2841']);
  });

  test('refusals: bad post, bad mode, unknown post; DELETE clears a stale row', async () => {
    const store = fresh();
    expect((await call(modes(store), 'GET', 'comment-modes/page/b1')).body.error).toBe('invalid_post');
    expect((await call(modes(store), 'PUT', 'comment-modes/blog/b1', { mode: 'closed' })).body.error).toBe('invalid_mode');
    const unknown = await call(modes(store), 'PUT', 'comment-modes/blog/nope', { mode: 'off' });
    expect([unknown.status, unknown.body.error]).toEqual([404, 'post_not_found']);
    expect((await call(modes(store), 'GET', 'comment-modes/blog/nope')).status).toBe(404);

    const seeded = seedModes(POSTS);
    const stale = (await call(modes(seeded), 'GET', 'comment-modes')).body.modes.find((mode: { title: string | null }) => mode.title === null);
    expect(stale).toMatchObject({ override: 'off', tagMode: null, effectiveMode: 'off' });
    const cleared = await call(modes(seeded), 'DELETE', `comment-modes/${stale.surface}/${stale.postId}`);
    expect(cleared.body.mode).toMatchObject({ override: null, tagMode: null, effectiveMode: null });
  });
});

/* ------------------------------------------------------------------ */

describe('portal demo: pin and lock', () => {
  const HOUR = 3_600_000;
  function row(id: string, status: AdminCommentStatus, extra: Partial<AdminCommentRecord> = {}): AdminCommentRecord {
    return {
      id,
      postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down',
      postSlug: 'retry-budget',
      parentId: null,
      author: `writer-${id}`,
      verified: false,
      body: `Body of ${id}`,
      status,
      moderationAction: 'publish',
      moderationReason: 'ok',
      moderationNote: null,
      moderationModel: null,
      country: 'AU',
      createdAt: new Date(Date.now() - HOUR).toISOString(),
      editedAt: null,
      actor: demoActor(),
      ...extra,
    };
  }
  const controls = (store: CommentAdminStore): Handler => (request, segments) => handleCommentControlsDemo(request, segments, store);

  test('one pin per post: a second pin replaces the first, a repeat keeps its time', async () => {
    const store: CommentAdminStore = {
      comments: [row('a', 'published'), row('b', 'published'), row('c', 'published', { postId: 'other' })],
      activity: [],
    };
    const first = await call(controls(store), 'PUT', 'comments/a/pin');
    expect(first.body).toMatchObject({ comment: { id: 'a', surface: 'blog', postId: '665f0a11' }, replaced: null });
    const again = await call(controls(store), 'PUT', 'comments/a/pin');
    expect(again.body.comment.pinnedAt).toBe(first.body.comment.pinnedAt);

    expect((await call(controls(store), 'PUT', 'comments/c/pin')).body.replaced).toBeNull();
    expect((await call(controls(store), 'PUT', 'comments/b/pin')).body.replaced).toBe('a');
    // The state rides on the record, so the queue lists it.
    expect(store.comments.map((comment) => Boolean(comment.pinnedAt))).toEqual([false, true, true]);
    expect((await call(controls(store), 'DELETE', 'comments/b/pin')).body).toMatchObject({ comment: { pinnedAt: null }, replaced: null });
    expect((await call(controls(store), 'DELETE', 'comments/b/pin')).status).toBe(200);
    expect(store.activity.map((entry) => entry.note)).toEqual([
      'Unpinned from the admin portal.',
      'Pinned from the admin portal.',
      'Pinned from the admin portal.',
      'Pinned from the admin portal.',
    ]);
    expect(store.activity.every((entry) => entry.event === 'comment.moderate')).toBe(true);
  });

  test('only a published root can be pinned', async () => {
    const store: CommentAdminStore = {
      comments: [row('root', 'published'), row('reply', 'published', { parentId: 'root' }), row('held', 'held')],
      activity: [],
    };
    for (const id of ['reply', 'held']) {
      const refused = await call(controls(store), 'PUT', `comments/${id}/pin`);
      expect([refused.status, refused.body.error]).toEqual([409, 'comment_not_pinnable']);
    }
    expect((await call(controls(store), 'PUT', 'comments/nope/pin')).status).toBe(404);
  });

  test('a lock lands on the thread root, whatever id it was given', async () => {
    const store: CommentAdminStore = {
      comments: [row('root', 'held'), row('reply', 'published', { parentId: 'root' })],
      activity: [],
    };
    const locked = await call(controls(store), 'PUT', 'comments/reply/lock');
    expect(locked.body.comment.id).toBe('root');
    expect(locked.body.comment.lockedAt).toBeString();
    const again = await call(controls(store), 'PUT', 'comments/root/lock');
    expect(again.body.comment.lockedAt).toBe(locked.body.comment.lockedAt);
    expect(store.comments.map((comment) => comment.lockedAt ?? null)).toEqual([locked.body.comment.lockedAt, null]);
    expect((await call(controls(store), 'DELETE', 'comments/reply/lock')).body.comment).toEqual({
      id: 'root', surface: 'blog', postId: '665f0a11', lockedAt: null,
    });
    expect(store.activity.map((entry) => entry.note)).toEqual(['Replies unlocked from the admin portal.', 'Replies locked from the admin portal.']);
    expect((await call(controls(store), 'PUT', 'comments/nope/lock')).status).toBe(404);
  });

  test('other comment paths are not this module’s', async () => {
    const store: CommentAdminStore = { comments: [row('a', 'published')], activity: [] };
    const request = new Request('http://localhost/x', { method: 'POST' });
    expect(await handleCommentControlsDemo(request, ['comments', 'a', 'reply'], store)).toBeNull();
    expect(await handleCommentControlsDemo(request, ['comments', 'a'], store)).toBeNull();
  });
});
