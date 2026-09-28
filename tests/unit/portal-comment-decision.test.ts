/* The pane's "why is this here" line, from every note site-api writes:
   each fact once, the note's echo of the reason and checker dropped. */
import { describe, expect, test } from 'bun:test';
import { decisionOf } from '@/features/portal/comments/model';
import type { PortalComment } from '@/features/admin/server/portal-client';

function comment(status: PortalComment['status'], reason: string | null, note: string | null, model: string | null): PortalComment {
  return { status, moderationReason: reason, moderationNote: note, moderationModel: model } as PortalComment;
}

describe('decisionOf', () => {
  test('says each fact once', () => {
    const cases: Array<[PortalComment, string, string | null]> = [
      [comment('rejected', 'spam', 'Akismet: spam.', 'akismet'), 'Rejected as spam by Akismet', null],
      [comment('rejected', 'spam', 'Akismet: blatant spam.', 'akismet'), 'Rejected as spam by Akismet', null],
      [
        comment('held', 'personal_info', 'Akismet: ham. AI: personal_info -- Contains a phone number.', 'akismet+task-guard'),
        'Held as personal information by AI',
        'Contains a phone number.',
      ],
      [
        comment('held', 'promotional', 'Akismet: ham. AI: promotional -- Links a paid service Authorship: agent -- Uniform template phrasing', 'akismet+task-guard'),
        'Held as promotion by AI',
        'Links a paid service. Reads as written by an agent: Uniform template phrasing.',
      ],
      [comment('rejected', 'promotional', 'Rejected by the owner from the admin portal.', null), 'Rejected as promotion by you in the portal', null],
      [comment('rejected', 'abuse', 'Rejected by the owner from Telegram.', null), 'Rejected as abuse by you in Telegram', null],
      [comment('held', 'promotional', 'Heuristic: link_count', null), 'Held as promotion by a rule', 'Too many links.'],
      [comment('held', 'ok', 'Heuristic: duplicate_body', null), 'Held by a rule', 'Same text as an earlier comment.'],
      [comment('held', 'ok', 'Declared agent: the request carried Signature-Agent.', null), 'Held by a rule', 'The request carried Signature-Agent.'],
      [comment('held', 'ok', 'Shadow-banned writer.', null), 'Held because the writer is banned', null],
      [comment('held', null, 'Moderation could not reach a verdict; held for manual review.', null), 'Held for review: the checks could not decide', null],
      [comment('held', 'ok', 'AI verdict pending.', null), 'Held until the AI check answers', null],
      [
        comment('held', 'abuse', 'Email confirmed; still held. Akismet: ham. AI: abuse -- Insults the author.', 'akismet+task-guard'),
        'Held as abuse by AI',
        'Insults the author.',
      ],
    ];
    for (const [row, summary, detail] of cases) expect(decisionOf(row)).toEqual({ summary, detail });
  });

  test('a writer asked to confirm an email says why, and what the AI thought', () => {
    const scored = comment('held', 'ok', 'Awaiting email: score 7 (new session, pasted body). Akismet: ham. AI: ok.', 'akismet+task-guard');
    expect(decisionOf(scored)).toEqual({ summary: 'Waiting for the writer to confirm an email', detail: 'Score 7: new session, pasted body.' });
    const locked = comment('held', 'ok', 'Awaiting email: anonymous comments are locked down until 2026-09-29T00:00:00Z (flood). Akismet: ham. AI: spam -- Crypto pitch.', 'akismet+task-guard');
    expect(decisionOf(locked)).toEqual({
      summary: 'Waiting for the writer to confirm an email',
      detail: 'Anonymous comments are locked down until 2026-09-29T00:00:00Z (flood). Crypto pitch.',
    });
  });

  test('a note it cannot read is shown as written', () => {
    expect(decisionOf(comment('held', 'spam', 'Something new from site-api', 'akismet'))).toEqual({
      summary: 'Held as spam by Akismet',
      detail: 'Something new from site-api.',
    });
  });

  test('published and deleted rows need no reason', () => {
    expect(decisionOf(comment('published', 'ok', 'Akismet: ham. AI: ok.', 'akismet+task-guard'))).toBeNull();
    expect(decisionOf(comment('deleted', 'spam', 'Deleted by the owner from the admin portal.', null))).toBeNull();
  });
});
