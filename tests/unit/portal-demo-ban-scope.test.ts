import { afterEach, describe, expect, test } from 'bun:test';
import type { AdminCommentActor, AdminCommentRecord, AdminCommentStatus } from '@bunizao/contracts';
import { demoActor } from '../../src/features/admin/server/portal-demo';
import {
  banScope,
  handleModerationDemo,
  resetModerationDemo,
  type DemoReaction,
} from '../../src/features/portal/server/demo/moderation';

/* The demo's ban-and-delete against site-api's rules: what a sweep takes,
   what it spares, and that a restore puts back exactly that. The keys are
   made up so the seeded reactions never match them. */

const HOUR = 3_600_000;
const FP = 'feedf00d';
const SESSION = 'se55b0a7';

function actor(overrides: { session?: string; readerId?: string | null; authAtWrite?: AdminCommentActor['authAtWrite'] } = {}): AdminCommentActor {
  return demoActor({
    readerId: overrides.readerId ?? null,
    authAtWrite: overrides.authAtWrite ?? 'anonymous',
    keys: { session: overrides.session ?? `se-${crypto.randomUUID().slice(0, 6)}`, clientFp: FP, ip: 'no-ip', ip24: 'no-ip24', fp: 'no-fp' },
  });
}

function row(id: string, status: AdminCommentStatus, who: AdminCommentActor, extra: Partial<AdminCommentRecord> = {}): AdminCommentRecord {
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
    moderationAction: status === 'held' ? 'hold' : 'publish',
    moderationReason: 'ok',
    moderationNote: null,
    moderationModel: null,
    country: 'AU',
    createdAt: new Date(Date.now() - HOUR).toISOString(),
    editedAt: null,
    actor: who,
    ...extra,
  };
}

function reaction(id: string, who: AdminCommentActor): DemoReaction {
  return {
    id,
    targetType: 'post',
    targetId: '665f0a11',
    postId: '665f0a11',
    postTitle: null,
    postSlug: null,
    emoji: 'fire',
    createdAt: new Date(Date.now() - HOUR).toISOString(),
    actor: who,
    facts: { os: 'Windows', bot: false, tapMs: 300, auth: 'pass', sampleIp: '203.0.113.7' },
  };
}

/** A spammer's comment, a sibling on the same device, a signed-in reader
    who shares the fingerprint, and the owner's reply on that device. */
function scene(writer: AdminCommentActor) {
  return [
    row('target', 'held', writer),
    row('sibling', 'held', actor()),
    row('bystander', 'published', actor({ readerId: 'reader-bystander', authAtWrite: 'verified' })),
    row('writer-published', 'published', actor({ readerId: 'reader-writer', authAtWrite: 'verified' })),
    row('owner-reply', 'published', actor({ readerId: 'reader-owner', authAtWrite: 'verified' }), { byAuthor: true }),
  ];
}

const sweep = { keys: [{ type: 'session' as const, value: SESSION }], sweepKeys: [{ type: 'client_fp' as const, value: FP }], purge: true, removeCommentId: 'target' };
const ids = (rows: readonly { id: string }[]) => rows.map((each) => each.id).sort();

describe('the demo ban scope', () => {
  test('a sweep spares other signed-in readers’ published comments and reactions, not the writer’s', () => {
    const comments = scene(actor({ session: SESSION, readerId: 'reader-writer', authAtWrite: 'verified' }));
    const reactions = [reaction('r-anon', actor()), reaction('r-bystander', actor({ readerId: 'reader-bystander' })), reaction('r-writer', actor({ readerId: 'reader-writer' }))];
    const scope = banScope(comments, reactions, sweep);
    expect(ids(scope.purge.comments)).toEqual(['sibling', 'target', 'writer-published']);
    expect(ids(scope.spared)).toEqual(['bystander']);
    expect(ids(scope.purge.reactions)).toEqual(['r-anon', 'r-writer']);
    expect(scope.reactions).toHaveLength(3);
  });

  test('a writer who claimed an account later is nobody’s writer, so every signed-in row is spared', () => {
    const comments = scene(actor({ session: SESSION, readerId: 'reader-writer', authAtWrite: 'anonymous' }));
    const scope = banScope(comments, [reaction('r-writer', actor({ readerId: 'reader-writer' }))], sweep);
    expect(ids(scope.spared)).toEqual(['bystander', 'writer-published']);
    expect(ids(scope.purge.comments)).toEqual(['sibling', 'target']);
    expect(scope.purge.reactions).toEqual([]);
  });

  test('the owner’s rows are never in scope', () => {
    const comments = scene(actor({ session: SESSION }));
    const scope = banScope(comments, [], sweep);
    expect(ids(scope.comments)).not.toContain('owner-reply');
  });

  test('without a purge only the ticked keys count, and only the one comment goes', () => {
    const comments = scene(actor({ session: SESSION }));
    const scope = banScope(comments, [], { ...sweep, purge: false });
    expect(ids(scope.comments)).toEqual(['target']);
    expect(ids(scope.purge.comments)).toEqual(['target']);
    expect(scope.spared).toEqual([]);
  });

  test('the comment the ban came from counts once, even outside the window', () => {
    const old = new Date(Date.now() - 120 * 24 * HOUR).toISOString();
    const comments = [row('target', 'published', actor({ session: SESSION }), { createdAt: old })];
    const scope = banScope(comments, [], { keys: [{ type: 'session', value: SESSION }], removeCommentId: 'target' });
    expect(ids(scope.comments)).toEqual(['target']);
    expect(ids(scope.purge.comments)).toEqual(['target']);
  });
});

describe('the demo ban routes', () => {
  afterEach(() => resetModerationDemo());

  async function call(comments: AdminCommentRecord[], method: string, path: string, body?: unknown) {
    const request = new Request(`http://localhost/dev/portal/api/admin/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    const response = await handleModerationDemo(request, path.split('/'), new URLSearchParams(), comments);
    if (!response) throw new Error(`no demo answer for ${method} ${path}`);
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  }

  test('a preview says exactly what the ban then removes, and a restore puts it back', async () => {
    const comments = scene(actor({ session: SESSION }));
    const preview = await call(comments, 'POST', 'bans/preview', sweep);
    // Two held rows from two sessions, nobody signed in: nothing to warn about.
    expect(preview.body.purge).toEqual({ comments: 2, reactions: 0, published: 0, sessions: 2, otherAccounts: 0 });
    expect(preview.body.spared).toBe(2);

    const ban = await call(comments, 'POST', 'bans', sweep);
    expect(ban.status).toBe(200);
    expect(ban.body.purged).toMatchObject({ comments: preview.body.purge.comments, reactions: preview.body.purge.reactions });
    expect(ban.body.bans.map((each: { keyType: string }) => each.keyType)).toEqual(['session']);
    const status = () => Object.fromEntries(comments.map((each) => [each.id, each.status]));
    expect(status()).toMatchObject({ target: 'deleted', sibling: 'deleted', bystander: 'published', 'owner-reply': 'published' });

    await call(comments, 'POST', `bans/operations/${ban.body.operation.id}/restore`);
    expect(status()).toMatchObject({ target: 'held', sibling: 'held', bystander: 'published' });
  });

  test('a preview names the other accounts a sweep reaches, never the writer’s own', async () => {
    const comments = [
      ...scene(actor({ session: SESSION, readerId: 'reader-writer', authAtWrite: 'verified' })),
      row('other-held', 'held', actor({ readerId: 'reader-other', authAtWrite: 'verified' })),
    ];
    const preview = await call(comments, 'POST', 'bans/preview', sweep);
    expect(preview.body.purge).toMatchObject({ comments: 4, published: 1, otherAccounts: 1 });
    expect(preview.body.spared).toBe(1);
  });

  test('refuses what site-api refuses', async () => {
    const comments = scene(actor({ session: SESSION }));
    const keys = [{ type: 'session', value: SESSION }];
    const cases: Array<[unknown, number, string]> = [
      [{ keys, removeCommentId: 'owner-reply' }, 400, 'owner_comment'],
      [{ keys, removeCommentId: 'missing' }, 404, 'comment_not_found'],
      [{ keys, removeCommentId: 7 }, 400, 'invalid_comment_id'],
      [{ keys, purge: 'yes' }, 400, 'invalid_purge'],
      [{ keys, purge: true, sweepKeys: [{ type: 'nope', value: 'x' }] }, 400, 'invalid_sweep_keys'],
      [{ keys, purge: true, sweepKeys: Array.from({ length: 20 }, (_, n) => ({ type: 'session', value: `sweep-${n}` })) }, 400, 'too_many_keys'],
    ];
    for (const [body, code, name] of cases) {
      const answer = await call(comments, 'POST', 'bans/preview', body);
      expect([answer.status, answer.body.error]).toEqual([code, name]);
    }
  });
});
