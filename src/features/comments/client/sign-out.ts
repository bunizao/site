/* The identity strip's sign-out — the arming half, which is the half both
   callers share.

   "Signed out" means two different things depending on who is asking. On a
   live thread the controller ends the reader session and clears what this
   browser had stored; on the lab page, which never hydrates because it renders
   the thread without a `data-post-id`, there is no session and nothing stored,
   and the honest meaning is the box flipping back to its fields. What the
   reader sees is the same in both places, so the two presses are written once
   here and the effect is the caller's. */

import { copyFor } from '@/features/comments/copy';

/** Arm the box's sign-out button, then hand the second press to `onConfirm`.

    Two presses, the second one landing on the question itself — the pattern
    Cancel already uses on an edit with unsaved changes
    (`.blog-comment__act--confirm`). A `window.confirm()` for forgetting a name
    is heavier than the thing being forgotten, and a second button appearing
    beside the first would move Post out from under the cursor.

    Armed, the button says so in words. It used to arm with a red tick and an
    `aria-label`, which explained the second press to a screen reader and to
    nobody else — and a tick is the one glyph a reader who has just pressed
    something can read as "done". Colour still marks the state and nothing
    else, so red in this strip only ever means "one more press and the name is
    gone". Blur withdraws the question — clicking anywhere else puts the button
    back rather than leaving a red word standing over a reader who moved on.

    Bound once per button. Both this box's own script and the thread controller
    run on a live page, and two listeners on one button would make the first
    press behave like the second. */
export function wireSignOut(box: HTMLElement, onConfirm: () => void): void {
  const button = box.querySelector<HTMLButtonElement>('[data-compose-signout]');
  if (!button || button.dataset.signoutWired) return;
  button.dataset.signoutWired = 'true';

  // Resolved from the box, same as compose-validate.ts: both boxes sit under
  // the locale-stamped thread root, so this is always the table the page was
  // rendered from.
  const t = copyFor(box);

  // The button is two stacked icons and the class cross-fades them, so arming
  // is a class and a label -- no icon is swapped in or out, and a press
  // landing mid-fade catches the transition rather than restarting it.
  const label = (text: string): void => {
    button.setAttribute('aria-label', text);
    button.title = text;
  };

  // The visible question is written once and left there, clipped to nothing by
  // the CSS until the button is armed. Writing it on arm instead would mean
  // clearing it on disarm, which would blank the word before the button had
  // finished closing over it.
  const spoken = button.querySelector<HTMLElement>('[data-compose-signout-label]');
  if (spoken) spoken.textContent = t.signOutConfirm;

  const disarm = (): void => {
    button.classList.remove('blog-compose__signout--confirm');
    label(t.signOut);
  };

  button.addEventListener('click', () => {
    if (!button.classList.contains('blog-compose__signout--confirm')) {
      button.classList.add('blog-compose__signout--confirm');
      label(t.signOutConfirm);
      return;
    }
    disarm();
    onConfirm();
  });

  button.addEventListener('blur', disarm);
}
