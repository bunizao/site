// The desk's subscriptions by email (ui/Subscribe.astro). The quiet door
// unfolds its slip; the slip sends the address to the pool the blog's and
// the mood feed's panels send to, and says what happened in its own line.
//
// Turnstile, as the letter and the comment box run it: it starts settling
// when the slip opens, invisibly. When Cloudflare refuses that, the slip
// opens its checkbox under the line that asks for it and sends again, once,
// the moment it is ticked; an address that goes through takes the box away.
import {
  challengeTurnstile,
  dismissTurnstileChallenge,
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
  warmTurnstileToken,
} from '@/features/comments/client/turnstile-token';
import { readReaderEmail, rememberReaderEmail } from '@/lib/reader-email';
import { subscriptionEvidence } from '@/features/notify/subscribe-evidence';

const ACTION = 'notify_subscribe';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAY = {
  sending: 'Sending…',
  sent: 'Nearly there: a confirmation is on its way to your inbox.',
  already: "You're on the list already.",
  invalid: "That address doesn't look right.",
  limited: 'That is a lot of tries. Give it a few minutes.',
  verify: 'One more step: tick the box below and it goes.',
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
  const evidence = subscriptionEvidence();
  let sending = false;
  // The send that follows a ticked box. One per press: a refusal of that one
  // leaves the box up for the next press instead of asking again on its own.
  let resending = false;

  const say = (text: string, tone: 'note' | 'error' | 'done' = 'note') => {
    status.textContent = text;
    form.dataset.tone = tone;
  };

  toggle.addEventListener('click', () => {
    const open = form.hidden;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) return;
    evidence.open();
    // Both slips ask for the one check; it lives in whichever is open.
    setTurnstileHost(ACTION, host);
    if (siteKey) warmTurnstileToken(siteKey, ACTION);
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

  const challengeAndResend = async () => {
    const token = await challengeTurnstile(siteKey, ACTION);
    if (!token || sending) return;
    resending = true;
    form.requestSubmit();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    const isResend = resending;
    resending = false;
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
    let next: 'challenge' | 'warm' | null = null;
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
          website: (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '',
          ...await evidence.collect(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { status?: string; error?: string };
      if (response.ok) {
        dismissTurnstileChallenge(ACTION);
        rememberReaderEmail(address);
        say(data.status === 'already_subscribed' ? SAY.already : SAY.sent, 'done');
        form.classList.add('is-done');
      } else if (response.status === 400 && data.error === 'Turnstile verification failed') {
        say(SAY.verify, 'error');
        if (!isResend) next = 'challenge';
      } else {
        say(response.status === 429 ? SAY.limited : SAY.failed, 'error');
        next = 'warm';
      }
    } catch {
      say(SAY.failed, 'error');
      next = 'warm';
    } finally {
      // A token is spent whatever the answer was.
      releaseTurnstileToken(ACTION);
      sending = false;
      submit.disabled = false;
      form.classList.remove('is-sending');
    }
    if (!siteKey) return;
    if (next === 'challenge') void challengeAndResend();
    // Settle the next token now, so trying again does not wait on a solve.
    else if (next === 'warm') warmTurnstileToken(siteKey, ACTION);
  });
}

export function initSubscribe() {
  document.querySelectorAll<HTMLButtonElement>('[data-subscribe-open]').forEach((toggle) => {
    const form = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    if (form instanceof HTMLFormElement) wire(toggle, form);
  });
}
