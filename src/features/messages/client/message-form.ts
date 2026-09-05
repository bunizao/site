// The /message form's whole client. One form, one POST, one receipt.
//
// Vanilla and self-contained on purpose. The comment box needs a controller
// because it renders a live list, paginates it, swaps rows into edit mode and
// tracks reader identity; this page has none of that. What it does share it
// imports rather than reimplements: the Turnstile widget lifecycle and the
// dwell-token mint, both of which the risk stack on the other end requires.
//
// The dwell token comes from /api/v2/comments/dwell-token. That is not a
// borrowed endpoint -- it signs nothing but a timestamp with the shared
// comments session secret, which is exactly what verifyDwellToken checks on
// the message path too. A second endpoint minting the same token from the
// same secret would be a second name for one thing.

import {
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
  warmTurnstileToken,
} from '@/features/comments/client/turnstile-token';
import { messagesCopy, type MessageCopy } from '@/features/messages/copy';

const ACTION = 'owner_message_create' as const;
const DWELL_TOKEN_REFRESH_AGE_MS = 20 * 60_000;
const MIN_BODY_LENGTH = 2;
const MAX_BODY_LENGTH = 4000;

interface CreateResult {
  id: string;
  createdAt: string;
  replyable: boolean;
  verificationSent: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initMessageForm(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-message-form]');
  const formView = root.querySelector<HTMLElement>('[data-message-form-view]');
  const sentView = root.querySelector<HTMLElement>('[data-message-sent-view]');
  const sentBody = root.querySelector<HTMLElement>('[data-message-sent-body]');
  const errorBox = root.querySelector<HTMLElement>('[data-message-error]');
  const submit = root.querySelector<HTMLButtonElement>('[data-message-submit]');
  const submitLabel = root.querySelector<HTMLElement>('[data-message-submit-label]');
  const turnstileHost = root.querySelector<HTMLElement>('[data-message-turnstile]');
  const again = root.querySelector<HTMLButtonElement>('[data-message-again]');
  // The two bubbles the thread grows on its own. Both are optional: the form
  // works without either, they are the presentation.
  const draft = root.querySelector<HTMLElement>('[data-message-draft]');
  const draftText = root.querySelector<HTMLElement>('[data-message-draft-text]');
  const typing = root.querySelector<HTMLElement>('[data-message-typing]');
  if (!form || !formView || !sentView || !sentBody || !errorBox || !submit || !submitLabel) return;

  const nameField = form.elements.namedItem('displayName') as HTMLInputElement | null;
  const emailField = form.elements.namedItem('email') as HTMLInputElement | null;
  const bodyField = form.elements.namedItem('body') as HTMLTextAreaElement | null;
  const website = form.elements.namedItem('website') as HTMLInputElement | null;
  if (!nameField || !bodyField) return;

  const locale = (root.dataset.locale === 'en' ? 'en' : 'zh') as 'zh' | 'en';
  const t: MessageCopy = messagesCopy[locale];
  const siteKey = root.dataset.turnstileSiteKey ?? '';

  if (turnstileHost) setTurnstileHost(ACTION, turnstileHost);

  let dwellToken = '';
  let dwellTokenMintedAt = 0;
  let submitting = false;

  async function ensureDwellToken(): Promise<void> {
    if (dwellToken && Date.now() - dwellTokenMintedAt < DWELL_TOKEN_REFRESH_AGE_MS) return;
    try {
      const response = await fetch('/api/v2/comments/dwell-token', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const result = (await response.json()) as { token?: string };
      if (result?.token) {
        dwellToken = result.token;
        dwellTokenMintedAt = Date.now();
      }
    } catch {
      // Leave the token empty. The service treats a missing or bad dwell
      // token as a silent drop, so failing here must not look like success:
      // showError below runs when the submit comes back without one.
    }
  }

  // Both warm-ups fire on the reader's first contact with the form rather than
  // on load: a Turnstile solve costs ~2.3s, and paying it for every visitor
  // who only scrolls past is waste. By the time anyone has typed a sentence
  // the token is long since ready.
  const warm = () => {
    void ensureDwellToken();
    if (siteKey) warmTurnstileToken(siteKey, ACTION);
  };
  form.addEventListener('focusin', warm, { once: true });

  // Arrows, not function declarations: a hoisted declaration could in
  // principle run before the null guard above, so TypeScript refuses to carry
  // the narrowing into one.
  const showError = (text: string): void => {
    errorBox.textContent = text;
    errorBox.hidden = false;
  };

  const clearError = (): void => {
    errorBox.hidden = true;
    errorBox.textContent = '';
  };

  const setBusy = (busy: boolean): void => {
    submitting = busy;
    submit.disabled = busy;
    submitLabel.textContent = busy ? t.submitting : t.submit;
  };

  // What was written, moved into the bubble on the right. textContent, so what
  // lands in the thread is exactly the characters typed.
  const syncDraft = (): void => {
    if (!draft || !draftText) return;
    const text = bodyField.value.trim();
    draftText.textContent = text;
    draft.hidden = text.length === 0;
  };

  // The composer grows with the message instead of opening as an empty well.
  // scrollHeight excludes the border under border-box sizing, hence the 2.
  const autoGrow = (): void => {
    bodyField.style.height = 'auto';
    bodyField.style.height = `${bodyField.scrollHeight + 2}px`;
  };

  // The markup ships it disabled; this is the handoff.
  setBusy(false);

  bodyField.addEventListener('input', autoGrow);
  // A restored form (bfcache, or the browser refilling on reload) already has
  // text in it before any input event fires.
  autoGrow();

  const reveal = (element: HTMLElement | null): void => {
    if (!element) return;
    element.hidden = false;
    element.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    clearError();

    const displayName = nameField.value.trim();
    const body = bodyField.value.trim();
    const email = emailField?.value.trim() ?? '';

    // Client-side checks exist to save a round trip on the three mistakes
    // people actually make, not to be the validation. The service re-checks
    // every one of them.
    if (!displayName) {
      showError(t.errorName);
      nameField.focus();
      return;
    }
    if (body.length < MIN_BODY_LENGTH || body.length > MAX_BODY_LENGTH) {
      showError(t.errorBody);
      bodyField.focus();
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      showError(t.errorEmail);
      emailField?.focus();
      return;
    }

    setBusy(true);
    syncDraft();
    // The typing bubble is on screen for exactly as long as the request is in
    // flight. It represents a real wait, not a staged one.
    if (typing) typing.hidden = false;
    try {
      await ensureDwellToken();

      let turnstileToken = '';
      if (siteKey) {
        try {
          // No staleness check here: getTurnstileToken already drops a token
          // that has aged past Cloudflare's expiry and solves a fresh one.
          turnstileToken = await getTurnstileToken(siteKey, ACTION);
        } catch {
          showError(t.errorTurnstile);
          setBusy(false);
          return;
        }
      }

      const response = await fetch('/api/v2/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          body,
          displayName,
          email: email || undefined,
          turnstileToken,
          dwellToken,
          website: website?.value ?? '',
          locale,
        }),
      });

      if (!response.ok) {
        // A used token cannot be reused, whatever the refusal was.
        releaseTurnstileToken(ACTION);
        if (response.status === 429) {
          showError(t.errorRateLimited);
        } else if (response.status === 400 || response.status === 503) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null;
          showError(
            detail?.error?.startsWith('turnstile') ? t.errorTurnstile : t.errorGeneric,
          );
        } else {
          showError(t.errorGeneric);
        }
        setBusy(false);
        return;
      }

      const result = (await response.json()) as CreateResult;
      releaseTurnstileToken(ACTION);
      // A fresh dwell token per submission: the one just spent is burnt.
      dwellToken = '';
      dwellTokenMintedAt = 0;

      sentBody.textContent = result.verificationSent
        ? t.sentVerify
        : result.replyable
          ? t.sentReplyable
          : t.sentAnonymous;
      if (typing) typing.hidden = true;
      formView.hidden = true;
      reveal(sentView);
      sentView.focus({ preventScroll: true });
    } catch {
      showError(t.errorGeneric);
    } finally {
      if (typing) typing.hidden = true;
      // A refusal puts the page back exactly where it was: the words go back to
      // being a draft rather than a message that stands in the thread.
      if (sentView.hidden && draft) draft.hidden = true;
      setBusy(false);
    }
  });

  again?.addEventListener('click', () => {
    form.reset();
    // The thread rewinds to the composer: the sent bubble and the receipt both
    // go, so the next message is not written under the last one's answer.
    syncDraft();
    autoGrow();
    sentView.hidden = true;
    formView.hidden = false;
    clearError();
    bodyField.focus();
    warm();
  });
}
