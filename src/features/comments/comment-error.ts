/* What to tell a reader when the API refuses a comment.

   There used to be one line for every failure -- "没能发出去，草稿还在。再试一
   次。" -- which is exactly right for a dropped connection and wrong for most
   of the rest of the list. It sent a rate-limited reader straight back into
   the limit, told a reader whose Turnstile token had gone stale to retry the
   same dead token, and promised a retry on a post whose comments had been
   pulled. A message worth printing names the next move, and there are only a
   few distinct next moves: reconnect, wait, refresh, shorten, fix a field, or
   give up.

   Each one also carries a short code. The sentence is for the reader; the code
   is for the reader who gives up and tells somebody -- it survives translation,
   paraphrase, and a phone photo of a screen, and it lands on a grep-able
   constant in this file.

   This repo does not own the contract: /api/v2/comments is served by site-api.
   The shapes read here are the ones documented in
   src/content/docs/api/comments.md, and everything reads defensively. */

export type CommentErrorCode =
  | 'NET'
  | 'RATE'
  | 'BOT'
  | 'GONE'
  | 'THREAD'
  | 'CLOSED'
  | 'NAME'
  | 'EMAIL'
  | 'LONG'
  | 'STALE'
  | 'INPUT'
  | 'SERVER';

export interface CommentFailure {
  code: CommentErrorCode;
  /** HTTP status, or 0 when the request never reached a server at all. */
  status: number;
  message: string;
}

/** site-api answers with two unrelated error envelopes -- `{error: {code,
    message}}` for the mood family, `{error: "...", code?: "..."}` for
    everything built on jsonError() -- and a slug like `invalid_parent` can
    arrive as the `code` extra or as the error text itself. Look in all three
    places and hand back every string that turns up; classify() matches on a
    substring so it does not matter which one it was.

    Every one of them, not the first: a refused Turnstile answers with BOTH
    (`{error: "turnstile_failed", code: "invalid_token"}`), where `error` is the
    category and `code` is the sub-reason. Returning the first hit picked
    `invalid_token`, which matches nothing here, so the single most common real
    failure on this route fell through to INPUT and told the reader to reword a
    comment that was never the problem. */
export function readErrorSlug(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const { error, code } = body as { error?: unknown; code?: unknown };
  const found: string[] = [];
  if (typeof error === 'string') found.push(error);
  if (error && typeof error === 'object') {
    const nested = (error as { code?: unknown }).code;
    if (typeof nested === 'string') found.push(nested);
  }
  if (typeof code === 'string') found.push(code);
  return found.join(' ');
}

/** Ordered by how specific the signal is. A slug the server volunteered beats
    the status it arrived with, because 400 and 503 each carry more than one
    meaning on this route family. */
function classify(status: number, slug: string): CommentErrorCode {
  if (status === 0) return 'NET';
  if (status === 429) return 'RATE';
  if (slug.includes('turnstile')) return 'BOT';
  if (slug.includes('invalid_parent')) return 'THREAD';
  if (slug.includes('comment_target_unavailable')) return 'GONE';
  // Two refusals a reader can actually act on, and neither is about the words
  // they wrote: a name that is reserved or malformed, and an email whose
  // domain is not a real one. Both used to land in INPUT and be answered with
  // "try rewording it", which is advice for a field they had not touched.
  if (slug.includes('displayname')) return 'NAME';
  if (slug.includes('valid email')) return 'EMAIL';
  // 400 is not one refusal. site-api spends it on seven distinct things, and
  // answering all seven with "adjust your wording" was wrong for six of them
  // -- the reader's words are the problem in exactly one case.
  //
  // That one, and they can act on it precisely: over the 2000-character cap.
  // The two routes phrase it differently (`body must be 1-2000 characters` on
  // create, `body is required (1-2000 characters)` on edit), so both openings
  // are matched rather than the number they share, which would go quiet the
  // day the cap moves.
  if (slug.includes('body must be') || slug.includes('body is required')) return 'LONG';
  // The rest are a page that has gone stale under the reader: a dwell token
  // that expired, a post id the form never had, an envelope that did not
  // parse. Nothing about the comment is wrong and nothing about it can be
  // fixed by editing it -- the fix is a fresh page, and saying so beats
  // sending someone back to reword a sentence that was never refused. This is
  // the one the reader photographed: `dwellToken is required`, answered with
  // "换个说法再试试".
  if (slug.includes('dwelltoken')
    || slug.includes('postid is required')
    || slug.includes('parentid must be')
    || slug.includes('invalid json')) return 'STALE';
  // 403 not_owner and 409 edit_window_closed both mean the reader's claim on
  // this comment has run out. Retrying either is a guaranteed second refusal.
  if (status === 403 || status === 409) return 'CLOSED';
  if (status === 404) return 'GONE';
  if (status >= 500) return 'SERVER';
  // Whatever is left: a 400 this file has no name for. It says so instead of
  // guessing, because a confidently wrong explanation costs more than an
  // honest vague one -- which is what INPUT used to be for every 400 above.
  if (status >= 400) return 'INPUT';
  return 'SERVER';
}

export function describeCommentFailure(
  status: number,
  slug: string,
  messages: Record<CommentErrorCode, string>,
): CommentFailure {
  const code = classify(status, slug.toLowerCase());
  return { code, status, message: messages[code] };
}

/** The badge printed beside the message. The status is worth carrying because
    it is the one fact that narrows a report to a route, but a request that
    never landed has none -- printing "NET 0" would invent a server response. */
export function failureTag(failure: CommentFailure): string {
  return failure.status ? `${failure.code} ${failure.status}` : failure.code;
}
