/* Nothing a reader typed should die to a stray Cmd-R.
   Two guards, deliberately different in reach:

   1. A localStorage backup of the top compose box, restored on the next visit
      to the same post. The reply box is left out on purpose -- it is a single
      travelling node with no record of which comment it was answering, so a
      restored reply would reappear in a parked, closed box under nothing.
   2. A `beforeunload` prompt while ANY box on the page holds words, reply box
      included. The backup makes the loss recoverable; the prompt makes it
      avoidable, and the reply box gets the half it can have.

   Draft state is cleared by watching `data-receipt` rather than by a call from
   the submit path: the controller already writes `posted`, `held` or `nudge`
   there when a submission lands, and reading that keeps this module out of
   comments-controller.ts entirely.

   Storage is best-effort throughout. Private windows and blocked site data
   throw on access, and a reader who cannot store a draft should still be able
   to write one. */

const STORAGE_PREFIX = 'buxx:draft:';
const SAVE_DELAY_MS = 400;
/** Receipt values that mean the words are no longer the reader's to lose. */
const SETTLED = new Set(['posted', 'held', 'nudge']);

interface Draft {
  name?: string;
  email?: string;
  body: string;
}

interface ComposeFields {
  name: HTMLInputElement | null;
  email: HTMLInputElement | null;
  body: HTMLTextAreaElement | null;
}

function fieldsOf(compose: HTMLElement): ComposeFields {
  return {
    name: compose.querySelector<HTMLInputElement>('[data-compose-identity] input[type="text"]'),
    email: compose.querySelector<HTMLInputElement>('[data-compose-identity] input[type="email"]'),
    body: compose.querySelector<HTMLTextAreaElement>('.blog-compose__field'),
  };
}

/** Per post, not per page: the same thread on `/blog/x` and a preview of it
    are the same draft, and two posts never share one. */
function storageKey(compose: HTMLElement): string {
  const root = compose.closest<HTMLElement>('.blog-comments');
  return `${STORAGE_PREFIX}${root?.dataset.postId || location.pathname}`;
}

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return typeof parsed?.body === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft | null): void {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    /* Storage unavailable -- the beforeunload prompt is still standing. */
  }
}

// ---------------------------------------------------------------------------
// The unload prompt. One listener for the whole page, attached only while
// something is dirty: a `beforeunload` handler that is always bound disables
// the back/forward cache for every navigation away from the post, which is a
// real cost paid for a warning nobody needed.
// ---------------------------------------------------------------------------

let guardArmed = false;

function onBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // Legacy engines want a truthy returnValue; no browser has shown custom
  // text here in years, so there is no message to translate.
  event.returnValue = '';
}

function syncGuard(root: ParentNode): void {
  const dirty = [...root.querySelectorAll<HTMLElement>('.blog-compose')].some((compose) => {
    if (compose.hidden) return false;
    return Boolean(fieldsOf(compose).body?.value.trim());
  });
  if (dirty === guardArmed) return;
  guardArmed = dirty;
  if (dirty) window.addEventListener('beforeunload', onBeforeUnload);
  else window.removeEventListener('beforeunload', onBeforeUnload);
}

// ---------------------------------------------------------------------------

/** Wire every `.blog-compose` under `root`. Safe to call more than once on
    overlapping DOM -- a box is only ever bound once, guarded by a data
    attribute, the same way compose-validate.ts does it. */
export function wireDrafts(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.blog-compose').forEach((compose) => {
    if (compose.dataset.draftWired) return;
    compose.dataset.draftWired = 'true';

    const fields = fieldsOf(compose);
    if (!fields.body) return;

    // The reply box shares this module for the unload guard only -- see the
    // note at the top for why its text is not persisted.
    const persists = !compose.classList.contains('blog-reply');
    const key = storageKey(compose);

    if (persists) {
      const saved = readDraft(key);
      // Never overwrite something already on screen: a server-rendered draft
      // (receipt `submitting` or `error`) is the newer of the two.
      if (saved && !fields.body.value) {
        fields.body.value = saved.body;
        if (fields.name && !fields.name.value) fields.name.value = saved.name ?? '';
        if (fields.email && !fields.email.value) fields.email.value = saved.email ?? '';
        // `field-sizing: content` grows the textarea from its value, but only
        // once the browser has laid it out again.
        fields.body.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    let timer: number | undefined;
    compose.addEventListener('input', () => {
      syncGuard(document);
      if (!persists) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const body = fields.body?.value ?? '';
        if (!body.trim()) {
          writeDraft(key, null);
          return;
        }
        writeDraft(key, {
          body,
          name: fields.name?.value || undefined,
          email: fields.email?.value || undefined,
        });
      }, SAVE_DELAY_MS);
    });

    // The submission landed: the words are on the page (or held for review),
    // and the copy in storage is now the stale one.
    new MutationObserver(() => {
      if (!SETTLED.has(compose.dataset.receipt ?? '')) return;
      window.clearTimeout(timer);
      if (persists) writeDraft(key, null);
      syncGuard(document);
    }).observe(compose, { attributeFilter: ['data-receipt'] });
  });
}
