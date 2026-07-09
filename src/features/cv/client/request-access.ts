// Request-access dialog controller. Vanilla TS (matches the site's island
// idiom — SubscribePanel, mood controllers), driven by a native <dialog> so
// focus trap, Esc, and backdrop come for free. Any [data-cv-request-open]
// element opens it: redacted chips, the explicit request button, and the
// anonymous "PDF" action all share one panel.

interface RequestPayload {
  email: string;
  intent: string;
  lang: string;
}

let bound = false;

export function initCvRequestDialog(): void {
  if (bound) return;
  bound = true;

  const ready = () => {
    const dialog = document.querySelector<HTMLDialogElement>('[data-cv-dialog]');
    if (!dialog) return;

    const form = dialog.querySelector<HTMLFormElement>('[data-cv-request-form]');
    const success = dialog.querySelector<HTMLElement>('[data-cv-request-success]');
    const errorEl = dialog.querySelector<HTMLElement>('[data-cv-request-error]');
    const submit = dialog.querySelector<HTMLButtonElement>('[data-cv-request-submit]');
    const submitLabel = dialog.querySelector<HTMLElement>('[data-cv-submit-label]');
    const submitDefault = submitLabel?.textContent ?? '';
    const submittingText = form?.dataset.submitting ?? submitDefault;
    const endpoint = form?.dataset.endpoint ?? '/api/cv/request';
    const lang = form?.dataset.lang ?? 'en';

    const open = () => {
      // Reset to the form view each time it opens.
      if (form) form.hidden = false;
      if (success) success.hidden = true;
      if (errorEl) errorEl.hidden = true;
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
    };

    const close = () => {
      if (dialog.open) dialog.close();
    };

    document.querySelectorAll('[data-cv-request-open]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        open();
      });
    });

    dialog.querySelectorAll('[data-cv-dialog-close]').forEach((el) => {
      el.addEventListener('click', close);
    });

    // Click on the backdrop (outside the panel) closes.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (errorEl) errorEl.hidden = true;

      const data = new FormData(form);
      const payload: RequestPayload = {
        email: String(data.get('email') ?? '').trim(),
        intent: String(data.get('intent') ?? '').trim(),
        lang,
      };
      if (!payload.email) return;

      if (submit) submit.disabled = true;
      if (submitLabel) submitLabel.textContent = submittingText;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`request failed: ${response.status}`);

        if (form) form.hidden = true;
        if (success) success.hidden = false;
      } catch (error) {
        console.warn('[cv] access request failed', error);
        if (errorEl) errorEl.hidden = false;
      } finally {
        if (submit) submit.disabled = false;
        if (submitLabel) submitLabel.textContent = submitDefault;
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
}
