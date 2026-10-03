// The desk's subscriptions by email (ui/Subscribe.astro). The quiet door
// unfolds its slip; the slip sends the address to the pool the blog's and
// the mood feed's panels send to, behind the same invisible Turnstile check,
// and says what happened in its own last line.
import {
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
} from '@/features/comments/client/turnstile-token';
import { readReaderEmail, rememberReaderEmail } from '@/lib/reader-email';
import { loadTurnstileScript } from '@/lib/turnstile-script';

const ACTION = 'notify_subscribe';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAY = {
  sending: 'Sending…',
  sent: 'Nearly there: a confirmation is on its way to your inbox.',
  already: "You're on the list already.",
  invalid: "That address doesn't look right.",
  limited: 'That is a lot of tries. Give it a few minutes.',
  verify: 'The check failed. Try again?',
  failed: "That didn't go through. Try again in a moment?",
};

function wire(toggle: HTMLButtonElement, form: HTMLFormElement) {
  const email = form.elements.namedItem('email') as HTMLInputElement | null;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>('[data-subscribe-status]');
  const host = form.querySelector<HTMLElement>('[data-subscribe-turnstile]');
  if (!email || !submit || !status || !host) return;
  const note = status.innerHTML;
  const siteKey = form.dataset.turnstileSiteKey ?? '';
  let sending = false;

  const say = (text: string, tone: 'note' | 'error' | 'done' = 'note') => {
    status.textContent = text;
    form.dataset.tone = tone;
  };

  toggle.addEventListener('click', () => {
    const open = form.hidden;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // Both slips ask for the one check; it lives in whichever is open.
    setTurnstileHost(ACTION, host);
    void loadTurnstileScript();
    if (!email.value) email.value = readReaderEmail() ?? '';
    form.dispatchEvent(new CustomEvent('easel:repaint', { bubbles: true }));
    email.focus({ preventScroll: true });
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  form.addEventListener('input', () => {
    if (form.dataset.tone === 'error') {
      status.innerHTML = note;
      form.dataset.tone = 'note';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    const address = email.value.trim();
    if (!EMAIL_RE.test(address)) {
      say(SAY.invalid, 'error');
      email.focus();
      return;
    }
    sending = true;
    submit.disabled = true;
    form.classList.add('is-sending');
    say(SAY.sending);
    try {
      const mode = form.querySelector<HTMLInputElement>('input[name="deliveryMode"]:checked')?.value;
      const response = await fetch('/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: address,
          channels: [form.dataset.channel],
          deliveryMode: mode ?? 'instant',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          turnstileToken: await getTurnstileToken(siteKey, ACTION),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { status?: string; code?: string };
      if (response.ok) {
        rememberReaderEmail(address);
        say(data.status === 'already_subscribed' ? SAY.already : SAY.sent, 'done');
        form.classList.add('is-done');
      } else if (response.status === 429) say(SAY.limited, 'error');
      else if (data.code?.startsWith('turnstile')) say(SAY.verify, 'error');
      else say(SAY.failed, 'error');
    } catch {
      say(SAY.failed, 'error');
    } finally {
      releaseTurnstileToken(ACTION);
      sending = false;
      submit.disabled = false;
      form.classList.remove('is-sending');
    }
  });
}

export function initSubscribe() {
  document.querySelectorAll<HTMLButtonElement>('[data-subscribe-open]').forEach((toggle) => {
    const form = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    if (form instanceof HTMLFormElement) wire(toggle, form);
  });
}
