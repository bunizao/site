/* Shared shapes for the blog reaction bar and comment thread.
   Kept out of the .astro files so pages can import the types without
   importing the components. */

export interface Reactor {
  name: string;
  avatar?: string;
}

/** The reader's standing, from plans/blog-comments.md → "Identity: three
    grades, one table". Anonymous-first: a name and an email post a comment
    without either grade above it.
      anonymous — no identity on file; the compose box asks at submit
      claimed   — `buxx:reader` in localStorage; name + email known on this
                  browser, but never proven (L0, the `reader_anon` cookie)
      ready     — verified `reader_session` (L1/L2); the row is signed */
export type ReaderPhase = 'anonymous' | 'claimed' | 'ready';

/** Name + email mirrored into `buxx:reader` after a first post. Never a proof
    of identity — the `reader_anon` cookie is — just what saves the reader from
    retyping their name into every box on this browser. */
export interface ClaimedIdentity {
  name: string;
  email: string;
}

/** The signed-in (L1/L2) reader, as far as the compose box needs to know
    them. Distinct from ClaimedIdentity: this one comes from `/v2/reader/me`
    and carries a resolved avatar; a claimed identity never does. */
export interface Viewer {
  name: string;
  avatar?: string;
}

/** Where the current submission attempt stands. `idle` is "nothing in
    flight" — the box shows whatever `phase` says. Everything else is a
    receipt for one Post press.

    `submitting` is a state the live thread no longer enters: comments and
    edits are posted optimistically, so the row is on the page before the
    request leaves the browser and there is nothing left to spin about. It
    stays here, and stays rendered by CommentForm.astro and styled in
    comments.css, because /lab/comments draws every receipt on purpose. */
export type ComposeReceipt = 'idle' | 'submitting' | 'posted' | 'held' | 'nudge' | 'error';

export interface BlogComment {
  id: string;
  author: string;
  /** Already formatted relative to now, e.g. "3d". */
  date: string;
  text: string;
  /** The post's author, marked so readers can find the reply that matters. */
  byAuthor?: boolean;
  /** Held by the moderation classifier; visible to its writer only. Renamed
      from `pending` to match the status enum in plans/blog-comments.md
      (`published | held | rejected | deleted`). */
  held?: boolean;
  isReply?: boolean;
  /** Reactions on the comment itself. A thread is a conversation, and most of
      what people want to say back is "agreed" — a like says it without adding
      a row nobody reads. */
  likes?: number;
  liked?: boolean;
  /** True when this browser owns the row — a verified reader match, or the
      `reader_anon` cookie matching the comment's session. Grows quiet
      edit/delete text-buttons in the actions row. */
  own?: boolean;
  /** Server clock deadline for the 15-minute edit window, ms since epoch.
      Only read when `own` is true; past it the row can still be deleted, just
      not edited in place. */
  editDeadline?: number;
  /** Edited at least once — a marker beside the date, not a diff. */
  edited?: boolean;
  /** Soft-deleted but kept as a shape-preserving placeholder, because replies
      hang underneath it and one-level threading has nowhere else to put them. */
  tombstone?: boolean;
  /** Dev/lab-only: render this row with its inline edit textarea already open,
      so the `editing` toggle is on screen without a click. Real toggles happen
      client-side in the DOM (see the script in CommentsSection.astro), never
      by re-rendering from a prop. */
  editing?: boolean;
}
