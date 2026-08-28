/* "Ask at submit, not at the door" — the one behaviour shared by every place
   a reader can post anonymously: the compose box at the top of a thread and
   the travelling reply box. Both import this instead of each carrying their
   own copy of the reveal logic, so the rule has one implementation to change
   when it changes.

   Presentational only, same as the components that call it: this flips
   attributes on elements already in the DOM (see IdentityRow.astro) and
   never fetches. Submission itself lands with client/comments-controller.ts. */

/** Open the identity row belonging to `compose` — used both by the shared
    submit-click guard below and by the compose box's own "换一个" switch,
    so there is exactly one sequence for "reveal this row". */
export function revealComposeIdentity(compose: HTMLElement): void {
  const submit = compose.querySelector<HTMLButtonElement>('[data-compose-submit]');
  const identity = compose.querySelector<HTMLElement>('[data-compose-identity]');
  submit?.setAttribute('aria-expanded', 'true');
  if (identity) identity.hidden = false;
  identity?.querySelector<HTMLInputElement>('input')?.focus();
}

/** Wire every `.blog-compose` under `root` so its submit button reveals the
    identity row on first press instead of submitting straight away. Safe to
    call more than once on overlapping DOM (the compose box and the reply box
    render on the same page and each component wires itself) — a button is
    only ever bound once, guarded by a data attribute rather than by which
    script happened to see it first. */
export function wireComposeIdentityReveal(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.blog-compose').forEach((compose) => {
    const submit = compose.querySelector<HTMLButtonElement>('[data-compose-submit]');
    const field = compose.querySelector<HTMLTextAreaElement>('.blog-compose__field');
    if (!submit || !field || submit.dataset.revealWired) return;
    submit.dataset.revealWired = 'true';

    submit.addEventListener('click', () => {
      // Claimed and ready readers already have an identity on file — submit
      // goes straight to the controller, nothing left to reveal.
      if (compose.dataset.phase !== 'anonymous') return;
      if (submit.getAttribute('aria-expanded') === 'true') return;

      // An empty box asks for nothing — requesting a name and an email
      // before anyone has written a word is the door-charge this design
      // exists to avoid.
      if (!field.value.trim()) {
        field.focus();
        return;
      }

      revealComposeIdentity(compose);
    });
  });
}
