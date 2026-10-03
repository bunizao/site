// Drives every .subscribe-panel on the page: open/close from its trigger,
// position it against that trigger, run the Turnstile gate, and submit the
// form. One controller serves both the mood feed and the blog — they share the
// markup in SubscribePanel.astro and differ only by `channels` and copy.
//
// Pages never render more than one panel, but the controller loops so a panel
// + trigger pair are matched by id, keeping it placement-agnostic.
//
// Turnstile, as the letter and the comment box run it: it starts settling
// when the panel opens, invisibly. When site-api refuses that token, the panel
// opens Cloudflare's checkbox above the submit row and sends again, once, the
// moment it is ticked; a subscription that goes through takes the box away.

import { readReaderEmail, rememberReaderEmail } from '@/lib/reader-email';
import {
  challengeTurnstile,
  dismissTurnstileChallenge,
  getTurnstileToken,
  releaseTurnstileToken,
  setTurnstileHost,
  warmTurnstileToken,
} from '@/features/comments/client/turnstile-token';

const TURNSTILE_ACTION = 'notify_subscribe';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function panelCopy(panel: HTMLElement) {
  const read = (key: string, fallback: string) => panel.dataset[key] || fallback;
  return {
    success: read('copySuccess', 'Confirmation sent.'),
    already: read('copyAlready', "You're already subscribed."),
    error: read('copyError', 'Something broke. Try again in a moment.'),
    invalidEmail: read('copyInvalidEmail', "That email doesn't look right."),
    needChannel: read('copyNeedChannel', 'Pick at least one.'),
    rateLimited: read('copyRateLimited', 'Too many tries. Wait before trying again.'),
    network: read('copyNetwork', 'Network trouble — check your connection.'),
    verifyFailed: read('copyVerifyFailed', 'One more step: tick the box above and it goes.'),
  };
}

const MOBILE_BREAKPOINT = 640;
const MOBILE_PANEL_PADDING = 10;
const MOBILE_PANEL_MIN_TOP = 72;
const HOVER_CLOSE_DELAY_MS = 140;

function setupPanel(panel: HTMLElement): void {
  if (panel.dataset.subscribeWired) return;
  panel.dataset.subscribeWired = 'true';
  const t = panelCopy(panel);
  const id = panel.dataset.subscribeId || '';
  const toggle = document.querySelector<HTMLElement>(`[data-subscribe-toggle="${id}"]`);
  if (!toggle) return;

  const scrim = document.querySelector<HTMLElement>(`[data-subscribe-scrim][data-subscribe-id="${id}"]`);

  // The panel is position:fixed and placed entirely by this script, but it is
  // rendered wherever the page happens to mount it — on the mood feed that is
  // inside .site-shell, a z-index:1 stacking context that pins the panel's own
  // z-index:60 under the fixed navbar. Reparent to <body> so the number means
  // what it says on every surface. The scrim rides along to stay its sibling.
  if (scrim && scrim.parentElement !== document.body) document.body.append(scrim);
  if (panel.parentElement !== document.body) document.body.append(panel);

  const inner = panel.querySelector<HTMLElement>('[data-sub-inner]')!;
  const formView = panel.querySelector<HTMLElement>('[data-sub-form-view]')!;
  const successView = panel.querySelector<HTMLElement>('[data-sub-success-view]')!;
  const errorView = panel.querySelector<HTMLElement>('[data-sub-error-view]')!;
  const closeBtn = panel.querySelector<HTMLButtonElement>('[data-sub-close]')!;
  const form = panel.querySelector<HTMLFormElement>('[data-sub-form]')!;
  const email = panel.querySelector<HTMLInputElement>('[data-sub-email]')!;
  const channelInputs = Array.from(panel.querySelectorAll<HTMLInputElement>('[data-sub-channel]'));
  const modeInputs = Array.from(panel.querySelectorAll<HTMLInputElement>('[data-sub-mode]'));
  const segGroup = panel.querySelector<HTMLElement>('.sub-seg');
  const submit = panel.querySelector<HTMLButtonElement>('[data-sub-submit]')!;
  const submitSpinner = panel.querySelector<HTMLElement>('[data-sub-submit-spinner]')!;
  const errorMsg = panel.querySelector<HTMLElement>('[data-sub-error]')!;
  const successText = panel.querySelector<HTMLElement>('[data-sub-success-text]')!;
  const errorText = panel.querySelector<HTMLElement>('[data-sub-error-text]')!;
  const doneBtn = panel.querySelector<HTMLButtonElement>('[data-sub-done]')!;
  const retryBtn = panel.querySelector<HTMLButtonElement>('[data-sub-retry]')!;
  const turnstileContainer = panel.querySelector<HTMLElement>('[data-sub-turnstile]')!;

  const anchor = panel.dataset.anchor === 'left' ? 'left' : 'right';
  const siteKey = panel.dataset.turnstileSiteKey || '';
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  setTurnstileHost(TURNSTILE_ACTION, turnstileContainer);

  let isSubmitting = false;
  let isOpen = false;
  // The send that follows a ticked box. One per press: a refusal of that one
  // leaves the box up for the next press instead of asking again on its own.
  let resending = false;
  let hoverCloseTimer: number | null = null;

  const clearHoverTimer = () => {
    if (hoverCloseTimer !== null) {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    }
  };

  const showView = (view: 'form' | 'success' | 'error') => {
    formView.classList.toggle('is-hidden', view !== 'form');
    successView.classList.toggle('is-hidden', view !== 'success');
    errorView.classList.toggle('is-hidden', view !== 'error');
  };

  const positionPanel = () => {
    const rect = toggle.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < MOBILE_BREAKPOINT;
    const gap = isMobile ? 8 : 6;
    const edge = 8; // keep clear of the viewport edges

    // Horizontal placement.
    if (isMobile) {
      const width = Math.min(vw - MOBILE_PANEL_PADDING * 2, 320);
      const left = Math.max(MOBILE_PANEL_PADDING, Math.round((vw - width) / 2));
      panel.style.width = `${width}px`;
      panel.style.left = `${left}px`;
      panel.style.right = 'auto';
    } else {
      panel.style.removeProperty('width');
      if (anchor === 'left') {
        panel.style.left = `${rect.left}px`;
        panel.style.right = 'auto';
      } else {
        panel.style.removeProperty('left');
        panel.style.right = `${vw - rect.right}px`;
      }
    }

    // Vertical placement: open below the trigger, but flip above when the panel
    // would run off the bottom and there's more room up top. At the foot of an
    // article the trigger sits near the viewport bottom, so a fixed panel that
    // only ever drops down ends up off-screen and unreachable. Measuring works
    // even while hidden — the panel keeps its box (visibility:hidden, not none).
    const minTop = isMobile ? MOBILE_PANEL_MIN_TOP : edge;
    const spaceBelow = vh - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - minTop;
    // The content's height, not the panel's: a clamped panel reports the
    // clamp, and the next pass would read that as fitting and unclamp it.
    const panelH = inner.offsetHeight;
    const openUp = panelH > spaceBelow && spaceAbove > spaceBelow;

    // Clamp height to the chosen side and let the body scroll if it still spills.
    const room = Math.max(0, openUp ? spaceAbove : spaceBelow);
    panel.style.maxHeight = panelH > room ? `${room}px` : '';
    panel.style.overflowY = panelH > room ? 'auto' : '';

    const originX = isMobile ? 'center' : anchor;
    if (openUp) {
      panel.style.top = 'auto';
      panel.style.bottom = `${vh - rect.top + gap}px`;
      panel.style.transformOrigin = `bottom ${originX}`;
    } else {
      panel.style.bottom = 'auto';
      panel.style.top = `${Math.max(rect.bottom + gap, minTop)}px`;
      panel.style.transformOrigin = `top ${originX}`;
    }
  };

  const syncSegment = () => {
    if (!segGroup || modeInputs.length === 0) return;
    const index = Math.max(0, modeInputs.findIndex((input) => input.checked));
    segGroup.style.setProperty('--sub-seg-count', String(modeInputs.length));
    segGroup.style.setProperty('--sub-seg-offset', `${index * 100}%`);
  };
  modeInputs.forEach((input) => input.addEventListener('change', syncSegment));
  syncSegment();

  const getDeliveryMode = () => modeInputs.find((input) => input.checked)?.value || 'instant';

  const syncGate = () => {
    submit.disabled = isSubmitting;
  };

  const resetForm = () => {
    showView('form');
    errorMsg.textContent = '';
    successText.textContent = t.success;
    isSubmitting = false;
    submitSpinner.classList.add('is-hidden');
    submit.removeAttribute('aria-busy');
    syncGate();
  };

  const openPanel = ({ focusEmail = true } = {}) => {
    isOpen = true;
    if (!email.value) {
      email.value = readReaderEmail() ?? '';
    }
    clearHoverTimer();
    positionPanel();
    panel.classList.add('is-open');
    scrim?.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-active');
    if (focusEmail) email.focus();
    if (siteKey) warmTurnstileToken(siteKey, TURNSTILE_ACTION);
  };

  const closePanel = () => {
    clearHoverTimer();
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('is-open');
    scrim?.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('is-active');
    setTimeout(() => {
      if (!isOpen) resetForm();
    }, 200);
  };

  const scheduleHoverClose = () => {
    if (!supportsHover) return;
    clearHoverTimer();
    hoverCloseTimer = window.setTimeout(() => {
      if (formView.classList.contains('is-hidden')) return;
      if (!panel.matches(':hover') && !toggle.matches(':hover') && !panel.contains(document.activeElement)) {
        closePanel();
      }
    }, HOVER_CLOSE_DELAY_MS);
  };

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isOpen) closePanel();
    else openPanel();
  });

  if (supportsHover) {
    toggle.addEventListener('mouseenter', () => openPanel({ focusEmail: false }));
    toggle.addEventListener('mouseleave', scheduleHoverClose);
    panel.addEventListener('mouseenter', clearHoverTimer);
    panel.addEventListener('mouseleave', scheduleHoverClose);
  }

  closeBtn.addEventListener('click', closePanel);
  doneBtn.addEventListener('click', closePanel);
  retryBtn.addEventListener('click', resetForm);

  document.addEventListener('click', (event) => {
    if (isOpen && !panel.contains(event.target as Node) && !toggle.contains(event.target as Node)) {
      closePanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      closePanel();
      toggle.focus();
    }
  });

  let repositionRaf = 0;
  const handleReposition = () => {
    if (!isOpen) return;
    cancelAnimationFrame(repositionRaf);
    repositionRaf = requestAnimationFrame(positionPanel);
  };
  window.addEventListener('scroll', handleReposition, { passive: true });
  window.addEventListener('resize', handleReposition, { passive: true });
  // The content grows while open -- an error line, the Turnstile checkbox --
  // and a panel placed for its old height runs off the viewport, taking the
  // submit row with it. Watching the content, not the panel, keeps the clamp
  // positionPanel writes out of the loop.
  new ResizeObserver(handleReposition).observe(inner);

  syncGate();

  // Deep link: /path?subscribe=1 opens the panel on load, then the param is
  // stripped so a refresh doesn't keep re-opening it.
  const url = new URL(window.location.href);
  const subParam = (url.searchParams.get('subscribe') ?? '').trim().toLowerCase();
  if (url.searchParams.has('subscribe') && !['0', 'false', 'no', 'off'].includes(subParam)) {
    requestAnimationFrame(() => openPanel({ focusEmail: true }));
    url.searchParams.delete('subscribe');
    const search = url.searchParams.toString();
    window.history.replaceState({}, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
  }

  // Resolves only once the box is solved, so nothing the reader needs waits on
  // it. A panel closed in the meantime keeps the token for the next press
  // instead of sending behind the reader's back.
  const challengeAndResend = async () => {
    const token = await challengeTurnstile(siteKey, TURNSTILE_ACTION);
    if (!token || isSubmitting || !isOpen) return;
    resending = true;
    form.requestSubmit();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    const isResend = resending;
    resending = false;
    const value = email.value.trim();
    if (!EMAIL_RE.test(value)) {
      errorMsg.textContent = t.invalidEmail;
      email.focus();
      return;
    }

    const channels = channelInputs.filter((input) => input.checked).map((input) => input.value);
    if (channels.length === 0) {
      errorMsg.textContent = t.needChannel;
      return;
    }

    errorMsg.textContent = '';
    isSubmitting = true;
    syncGate();
    submit.setAttribute('aria-busy', 'true');
    submitSpinner.classList.remove('is-hidden');
    const token = await getTurnstileToken(siteKey, TURNSTILE_ACTION);
    let next: 'challenge' | 'warm' | null = null;

    try {
      const response = await fetch('/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: value,
          channels,
          deliveryMode: getDeliveryMode(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          turnstileToken: token,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { status?: string; code?: string; error?: string };

      if (response.ok) {
        dismissTurnstileChallenge(TURNSTILE_ACTION);
        rememberReaderEmail(value);
        successText.textContent = data.status === 'already_subscribed' ? t.already : t.success;
        showView('success');
      } else if (response.status === 429) {
        errorMsg.textContent = t.rateLimited;
        next = 'warm';
      } else if (response.status === 400 && data.error === 'Turnstile verification failed') {
        // site-api's refusal; `code` says why (missing_token, invalid_token, …).
        errorMsg.textContent = t.verifyFailed;
        if (!isResend) next = 'challenge';
      } else {
        errorText.textContent = data.error || t.error;
        showView('error');
        next = 'warm';
      }
    } catch {
      errorText.textContent = t.network;
      showView('error');
      next = 'warm';
    } finally {
      // A token is spent whatever the answer was. Released before the
      // challenge below, which would otherwise read the spent one back.
      releaseTurnstileToken(TURNSTILE_ACTION);
      isSubmitting = false;
      submit.removeAttribute('aria-busy');
      submitSpinner.classList.add('is-hidden');
      syncGate();
    }
    if (!siteKey) return;
    if (next === 'challenge') void challengeAndResend();
    // Settle the next token now, so trying again does not wait on a solve.
    else if (next === 'warm') warmTurnstileToken(siteKey, TURNSTILE_ACTION);
  });
}

export function initSubscribePanels(): void {
  document.querySelectorAll<HTMLElement>('[data-subscribe-panel]').forEach(setupPanel);
}
