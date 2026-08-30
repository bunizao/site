/* "Say who you are, then write" — the one behaviour shared by every place a
   reader can post anonymously: the compose box at the top of a thread and the
   travelling reply box. Both import this instead of each carrying their own
   copy, so the rule has one implementation to change when it changes.

   This replaces the older reveal-at-submit module. The identity fields are on
   screen from first paint now (see IdentityRow.astro): Post no longer means
   two different things on two consecutive presses, and the cost is that the
   fields are asked for before the words exist. What is left to share is the
   guard — Post stays pressable and answers with a reason, because a greyed
   button never says which of the three fields it is waiting on.

   Presentational only, same as the components that call it: it marks fields,
   writes one line of text, and moves focus. Submission itself lands with
   client/comments-controller.ts, which runs validateCompose() before it sends
   anything.

   Email in that identity row is optional. An anonymous writer who leaves it
   empty still gets one extra step, though: confirmAnonymousSubmit() below is
   a second guard, called right after validateCompose() passes, that turns
   the first press of Post into a green recommendation next to the field
   instead of a submission. The second press -- with an email typed in
   between, or without -- goes through. */

import { copyFor } from '@/features/comments/copy';
import type { CommentsCopy } from '@/features/comments/copy';

type ComposeField = HTMLInputElement | HTMLTextAreaElement;

/** Every field a submission needs, in the order a reader reads them. Claimed
    and ready readers have an identity on file, so only the body is theirs to
    fill — `data-phase` on the wrapper is the single source for that. */
function requiredFields(compose: HTMLElement): ComposeField[] {
  const identity = compose.dataset.phase === 'anonymous'
    ? [...compose.querySelectorAll<HTMLInputElement>('[data-compose-identity] .blog-compose__input')]
    : [];
  const body = compose.querySelector<HTMLTextAreaElement>('.blog-compose__field');
  return [...identity, ...(body ? [body] : [])];
}

function messageFor(field: ComposeField, t: CommentsCopy): string | null {
  const value = field.value.trim();
  if (!value) {
    if (field instanceof HTMLTextAreaElement) return t.needBody;
    // Email is optional -- an empty address is never a validation failure.
    // The two-click anonymous-post confirm (confirmAnonymousSubmit below)
    // is what an empty field actually triggers on Post.
    if (field instanceof HTMLInputElement && field.type === 'email') return null;
    return t.needName;
  }
  if (field instanceof HTMLInputElement && field.type === 'email' && !field.checkValidity()) {
    return t.badEmail;
  }
  return null;
}

/* The alert carries an icon beside its text, so the message goes into the slot
   rather than over the whole element. Falls back to the element itself, which
   keeps this honest against any markup that has only a bare line. */
function say(compose: HTMLElement, message: string | null): void {
  const note = compose.querySelector<HTMLElement>('[data-compose-error]');
  if (!note) return;
  const slot = note.querySelector<HTMLElement>('[data-compose-error-text]') ?? note;
  slot.textContent = message ?? '';
  note.hidden = !message;
}

/** Mark the first unfilled field, say why in the alert, and put the cursor
    there. Returns true when the box is ready to send. Idempotent: safe to run
    from both the component's own script and the controller on the same
    click. */
export function validateCompose(compose: HTMLElement): boolean {
  // Resolved per compose element -- the compose box and the reply box are
  // both descendants of the same locale-stamped thread root, so this always
  // matches the table the calling component rendered its own text from.
  const t = copyFor(compose);
  const fields = requiredFields(compose);
  for (const field of fields) field.removeAttribute('aria-invalid');

  for (const field of fields) {
    const message = messageFor(field, t);
    if (!message) continue;
    field.setAttribute('aria-invalid', 'true');
    say(compose, message);
    field.focus();
    return false;
  }

  say(compose, null);
  return true;
}

/** True once this compose attempt's writer has already been shown the
    email recommendation -- see confirmAnonymousSubmit(). Kept on the box
    itself rather than in module state, since the root compose box and the
    travelling reply box each run their own attempt in parallel. */
function isAnonymousConfirmed(compose: HTMLElement): boolean {
  return compose.dataset.anonConfirmed === 'true';
}

/** Two-click confirm for an anonymous writer who leaves the email field
    empty. Called from client/comments-controller.ts's handleSubmit() right
    after validateCompose() passes -- that guard asks "is this fillable",
    this one asks "is this really what you want to send", and a box can fail
    the first without ever reaching the second.

    The first press with an empty field arms the box and shows the green
    recommendation next to it instead of submitting; returns false, so the
    caller sends nothing. Every press after that returns true immediately --
    with an email typed in the meantime, or still without one -- so the
    reader is never asked twice. Claimed and ready readers have no email
    field to be empty in the first place and are never gated: this returns
    true for them straight away. */
export function confirmAnonymousSubmit(compose: HTMLElement): boolean {
  if (compose.dataset.phase !== 'anonymous' || isAnonymousConfirmed(compose)) return true;

  const email = compose.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]');
  if (!email || email.value.trim()) return true;

  compose.dataset.anonConfirmed = 'true';
  const recommend = compose.querySelector<HTMLElement>('[data-compose-recommend]');
  if (recommend) recommend.hidden = false;
  return false;
}

/** Clears the arm once a comment actually posts (or a reply attempt is
    abandoned for another row -- see closeReplyBox() / closeReply()), so the
    next one written in the same box gets its own first press. */
export function resetAnonymousConfirm(compose: HTMLElement): void {
  delete compose.dataset.anonConfirmed;
  const recommend = compose.querySelector<HTMLElement>('[data-compose-recommend]');
  if (recommend) recommend.hidden = true;
}

/** Hides an already-shown recommendation the moment its email field stops
    being empty -- the reader is doing exactly what it suggested, so the box
    has said its piece. The arm itself does not clear (see
    confirmAnonymousSubmit): emptying the field again before posting does not
    bring the box back for a second showing. */
export function dismissRecommendOnFill(compose: HTMLElement): void {
  const email = compose.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]');
  const recommend = compose.querySelector<HTMLElement>('[data-compose-recommend]');
  if (!email || !recommend) return;
  email.addEventListener('input', () => {
    if (email.value.trim()) recommend.hidden = true;
  });
}

/** Wire every `.blog-compose` under `root` so a press of Post checks its
    fields, and so typing into a field the reader was just told about clears
    the complaint. Safe to call more than once on overlapping DOM (the compose
    box and the reply box render on the same page and each component wires
    itself) — a box is only ever bound once, guarded by a data attribute
    rather than by which script happened to see it first. */
export function wireComposeValidation(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.blog-compose').forEach((compose) => {
    const submit = compose.querySelector<HTMLButtonElement>('[data-compose-submit]');
    if (!submit || compose.dataset.validateWired) return;
    compose.dataset.validateWired = 'true';

    submit.addEventListener('click', () => {
      validateCompose(compose);
    });

    // Cleared on input rather than on blur: the complaint is about this field,
    // and it should go the moment the reader acts on it.
    compose.addEventListener('input', (event) => {
      const field = event.target as HTMLElement;
      if (field.getAttribute('aria-invalid') !== 'true') return;
      field.removeAttribute('aria-invalid');
      say(compose, null);
    });

    dismissRecommendOnFill(compose);
  });
}
