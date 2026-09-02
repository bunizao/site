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

/** The cap site-api enforces (`comments-data.ts`), mirrored here so the box
    can say no before the network does. Deliberately not a `maxlength` on the
    textarea: a hard attribute silently swallows the tail of a paste, and a
    reader who pasted 2400 characters would find 2000 of them with no idea
    which 400 went missing. Counting and refusing says the same thing out
    loud. */
export const MAX_BODY_LENGTH = 2000;

/** Where the counter starts existing. A number that sits under the box from
    the first keystroke is a meter nobody asked for on a form whose ordinary
    comment is two lines long; a number that appears at 90% is a warning. */
const COUNT_FROM = 1800;

/** Both surfaces count what the server counts -- `isBodyLengthValid` measures
    the trimmed body -- so the reader is never refused by a number the box had
    told them was fine. */
function bodyLength(field: ComposeField): number {
  return field.value.trim().length;
}

/** Draw the count into `slot`, or take it away. Silent above nothing and
    below `COUNT_FROM`.

    `aria-hidden`: this is a glance affordance, and a live region that
    re-announces a four-digit number on every keystroke is worse than no
    announcement at all. The accessible path is the refusal -- over the cap,
    Post writes into the alert, which is `role="alert"` and says the same
    sentence the server would have. */
export function sayBodyCount(slot: HTMLElement | null, length: number): void {
  if (!slot) return;
  const show = length >= COUNT_FROM;
  slot.hidden = !show;
  // Cleared on the way out too. A hidden slot holding a stale `data-over` is
  // invisible until the reader types back up past COUNT_FROM and the number
  // returns already red.
  slot.toggleAttribute('data-over', show && length > MAX_BODY_LENGTH);
  if (!show) return;
  slot.textContent = `${length}/${MAX_BODY_LENGTH}`;
}

/** One pass of the count's refusal animation, restarted if it is already
    running. Fired on the crossing by `wireBodyCounter`, and by the row
    editor, whose Save button is the only place a length refusal happens
    without the compose box's own nudge
    (`.blog-compose__box:has([aria-invalid])`) firing around it.

    Dropping the attribute and reading a layout property makes the engine
    retire the previous run before the next one is declared -- without the
    reflow the two coalesce and nothing moves. It costs a synchronous layout,
    which is affordable here because this fires on a crossing and a refused
    press, never on a keystroke. */
export function nudgeBodyCount(slot: HTMLElement | null): void {
  if (!slot) return;
  slot.removeAttribute('data-nudge');
  void slot.offsetWidth;
  slot.setAttribute('data-nudge', '');
}

/** Keep `slot` in step with `field`. Used by the compose box and the reply box
    (below) and by the row's inline edit field (comments-controller.ts), which
    is the same rule on a surface that is not a `.blog-compose`.

    Owns the crossing, because it is the only caller that can tell a change
    from a first paint. First paint states the count and says nothing about
    it: a draft restored from `localStorage` that was already over the cap
    should arrive red, not shaking at a reader who has not typed yet. And only
    upward -- getting back under the line is good news, and good news does not
    need announcing. */
export function wireBodyCounter(field: ComposeField, slot: HTMLElement | null): void {
  if (!slot) return;
  let over = bodyLength(field) > MAX_BODY_LENGTH;
  sayBodyCount(slot, bodyLength(field));

  field.addEventListener('input', (event) => {
    const length = bodyLength(field);
    sayBodyCount(slot, length);
    // Two guards, both about not shaking at somebody who did not do anything.
    // `!over`: typing is a high-frequency interaction, so a shake on every
    // keystroke past the cap is a twitch rather than feedback -- from the
    // crossing on, the red number carries the state by itself. `isTrusted`:
    // three places write this field and dispatch `input` to announce it (the
    // draft restore in drafts.ts, and both halves of a submission in
    // comments-controller.ts), and a program replaying a long draft is not a
    // reader crossing a line.
    if (length > MAX_BODY_LENGTH && !over && event.isTrusted) nudgeBodyCount(slot);
    over = length > MAX_BODY_LENGTH;
  });
}

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

/** True on a post tagged `#comments-verified`, where site-api refuses a
    comment that does not come from a verified address. Stamped on the box by
    whoever built it -- CommentForm.astro for the compose box, the controller
    for the travelling reply box -- so this module reads one attribute instead
    of being told twice. */
function requiresEmail(compose: HTMLElement): boolean {
  return compose.dataset.requireEmail === 'true';
}

function messageFor(field: ComposeField, t: CommentsCopy, requireEmail: boolean): string | null {
  const value = field.value.trim();
  if (!value) {
    if (field instanceof HTMLTextAreaElement) return t.needBody;
    // Email is optional -- an empty address is never a validation failure.
    // The two-click anonymous-post confirm (confirmAnonymousSubmit below)
    // is what an empty field actually triggers on Post. Unless the post takes
    // verified addresses only, in which case there is nothing to confirm: the
    // server would refuse this, so the box does, here, before the press costs
    // a round trip.
    if (field instanceof HTMLInputElement && field.type === 'email') {
      return requireEmail ? t.needEmail : null;
    }
    return t.needName;
  }
  // The same sentence the server sends back for the same reason (see
  // comment-error.ts -> LONG). Reusing the string rather than writing a
  // second one keeps the browser and site-api from disagreeing about the cap
  // in front of the reader.
  if (field instanceof HTMLTextAreaElement && value.length > MAX_BODY_LENGTH) {
    return t.submitError.LONG;
  }
  if (field instanceof HTMLInputElement && field.type === 'email' && !field.checkValidity()) {
    return t.badEmail;
  }
  return null;
}

/** Where a refusal can be read about, and what to call that link.

    The code chip is the natural place to hang it: it is already the part of
    the alert that means "this has a name somebody could look up", it already
    sits out of the reading path, and a reader who is done acting on the
    sentence is exactly the reader who wants the page. The alternative -- a
    "learn more" tail on the sentence itself -- pulls at every reader
    including the one who already knows what to do. */
export interface ComposeAlertHelp {
  href: string;
  /** Accessible name; the code alone announces as five stray characters. */
  label: string;
}

/** Fill the reference chip, as a link where there is somewhere to send the
    reader and as plain text everywhere else.

    Opens in a new tab, which is not the usual default here and is deliberate:
    the reader is standing in front of a box holding words they have not
    managed to post yet, and navigating that away to read about why is a
    worse outcome than the error was. */
function fillErrorCode(badge: HTMLElement, tag: string, help: ComposeAlertHelp | null): void {
  badge.hidden = !tag;
  if (!tag) {
    badge.replaceChildren();
    return;
  }
  if (!help) {
    badge.textContent = tag;
    return;
  }
  const link = document.createElement('a');
  link.href = help.href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = tag;
  link.title = help.label;
  link.setAttribute('aria-label', `${tag}: ${help.label}`);
  badge.replaceChildren(link);
}

/** The same chip, built rather than filled -- the reply box, the edit error
    and the row-action error are all assembled in script and have no markup to
    write into. */
export function buildErrorCode(tag: string, help: ComposeAlertHelp | null): HTMLElement {
  const badge = document.createElement('code');
  badge.className = 'blog-compose__code';
  fillErrorCode(badge, tag, help);
  return badge;
}

/** The one slot in a compose box that says something went wrong -- above the
    form, filled and coloured, exported because the controller's submit failure
    belongs in exactly the same place as this module's "you left a field
    empty". Two complaint surfaces around one box (this one above, a receipt
    line below) meant a reader had to learn which kind of trouble printed
    where; there is one now, and `null` clears it.

    The alert carries an icon beside its text, so the message goes into the
    slot rather than over the whole element. Falls back to the element itself,
    which keeps this honest against any markup that has only a bare line.

    `tag` is the short reference code the server's refusal earned (see
    comment-error.ts). Only submissions have one -- an empty field is not a
    fault anybody needs to report -- so it is optional and clears with the
    message. `help` turns that code into a link when there is a page worth
    reading underneath it. */
export function sayComposeAlert(
  compose: HTMLElement,
  message: string | null,
  tag = '',
  help: ComposeAlertHelp | null = null,
): void {
  const note = compose.querySelector<HTMLElement>('[data-compose-error]');
  if (!note) return;
  const slot = note.querySelector<HTMLElement>('[data-compose-error-text]') ?? note;
  slot.textContent = message ?? '';
  const badge = note.querySelector<HTMLElement>('[data-compose-error-code]');
  if (badge) {
    fillErrorCode(badge, tag, help);
  }
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
  const requireEmail = requiresEmail(compose);
  for (const field of fields) field.removeAttribute('aria-invalid');

  for (const field of fields) {
    const message = messageFor(field, t, requireEmail);
    if (!message) continue;
    field.setAttribute('aria-invalid', 'true');
    sayComposeAlert(compose, message);
    field.focus();
    return false;
  }

  sayComposeAlert(compose, null);
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
  // Nothing to recommend where the address is mandatory: validateCompose has
  // already refused an empty field by the time this runs, so a green "consider
  // leaving an email" beside a full one would be advice already taken.
  if (requiresEmail(compose)) return true;

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

    const body = compose.querySelector<HTMLTextAreaElement>('.blog-compose__field');
    if (body) wireBodyCounter(body, compose.querySelector<HTMLElement>('[data-compose-count]'));

    // Cleared on input rather than on blur: the complaint is about this field,
    // and it should go the moment the reader acts on it.
    compose.addEventListener('input', (event) => {
      const field = event.target as HTMLElement;
      if (field.getAttribute('aria-invalid') !== 'true') return;
      field.removeAttribute('aria-invalid');
      sayComposeAlert(compose, null);
    });

    dismissRecommendOnFill(compose);
  });
}
