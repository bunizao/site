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
   anything. */

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
  if (!show) return;
  slot.textContent = `${length}/${MAX_BODY_LENGTH}`;
  slot.toggleAttribute('data-over', length > MAX_BODY_LENGTH);
}

/** Keep `slot` in step with `field`. Used by the compose box and the reply box
    (below) and by the row's inline edit field (comments-controller.ts), which
    is the same rule on a surface that is not a `.blog-compose`. */
export function wireBodyCounter(field: ComposeField, slot: HTMLElement | null): void {
  if (!slot) return;
  const update = () => sayBodyCount(slot, bodyLength(field));
  field.addEventListener('input', update);
  update();
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

function messageFor(field: ComposeField, t: CommentsCopy): string | null {
  const value = field.value.trim();
  if (!value) {
    if (field instanceof HTMLTextAreaElement) return t.needBody;
    return field.type === 'email' ? t.needEmail : t.needName;
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
    message. */
export function sayComposeAlert(compose: HTMLElement, message: string | null, tag = ''): void {
  const note = compose.querySelector<HTMLElement>('[data-compose-error]');
  if (!note) return;
  const slot = note.querySelector<HTMLElement>('[data-compose-error-text]') ?? note;
  slot.textContent = message ?? '';
  const badge = note.querySelector<HTMLElement>('[data-compose-error-code]');
  if (badge) {
    badge.textContent = tag;
    badge.hidden = !tag;
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
  for (const field of fields) field.removeAttribute('aria-invalid');

  for (const field of fields) {
    const message = messageFor(field, t);
    if (!message) continue;
    field.setAttribute('aria-invalid', 'true');
    sayComposeAlert(compose, message);
    field.focus();
    return false;
  }

  sayComposeAlert(compose, null);
  return true;
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
  });
}
