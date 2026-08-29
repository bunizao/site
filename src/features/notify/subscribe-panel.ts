// Drives every .subscribe-panel on the page: open/close from its trigger,
// position it against that trigger, run the Turnstile gate, and submit the
// form. One controller serves both the mood feed and the blog — they share the
// markup in SubscribePanel.astro and differ only by `channels` and copy.
//
// Pages never render more than one panel, but the controller loops so a panel
// + trigger pair are matched by id, keeping it placement-agnostic.

import { readReaderEmail, rememberReaderEmail } from '@/lib/reader-email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Everything this controller says is authored in blog.copy (src/data/site.ts)
   and stamped onto the panel root as data-copy-*; site.ts itself never enters
   a client bundle. Fallbacks are English so a missing attribute degrades to
   readable text rather than to an empty element. */
function panelCopy(panel: HTMLElement) {
  const read = (key: string, fallback: string) => panel.dataset[key] || fallback;
  return {
    success: read('copySuccess', 'Confirmation sent.'),
    already: read('copyAlready', "You're already subscribed."),
    error: read('copyError', 'Something broke. Try again in a moment.'),
    invalidEmail: read('copyInvalidEmail', "That email doesn't look right."),
    needChannel: read('copyNeedChannel', 'Pick at least one.'),
    rateLimited: read('copyRateLimited', 'Too many tries. Give it a minute.'),
    network: read('copyNetwork', 'Network trouble — check your connection.'),
    verifyFailed: read('copyVerifyFailed', 'That check failed. Try again.'),
  };
}

const MOBILE_BREAKPOINT = 640;
const MOBILE_PANEL_PADDING = 10;
const MOBILE_PANEL_MIN_TOP = 72;
const HOVER_CLOSE_DELAY_MS = 140;

function setupPanel(panel: HTMLElement): void {
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

  let turnstileWidgetId: string | null = null;
  let turnstileScript: Promise<void> | null = null;
  let tokenPromise: Promise<string> | null = null;
  let settleToken: ((token: string) => void) | null = null;
  let isSubmitting = false;
  let isOpen = false;
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
    const panelH = panel.offsetHeight;
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

  // Nothing to gate on any more: the challenge is invisible and is asked for
  // at submit time, so the only reason to hold the button is a request already
  // in flight. The padlock and the "finish the security check" hint that used
  // to live here went with the visible widget.
  const syncGate = () => {
    submit.disabled = isSubmitting;
  };

  // ---- Turnstile, invisible ------------------------------------------------
  // Same shape as the comment box (comments-controller.ts): a hidden widget
  // that is executed for a token when the reader submits, rather than a
  // challenge box sitting in the form asking to be solved first. The panel is
  // three fields and a button; a 65px Cloudflare card under them was the
  // largest object in it.

  const loadTurnstile = (): Promise<void> => {
    if (turnstileScript) return turnstileScript;
    turnstileScript = new Promise((resolve) => {
      if (!siteKey || (window as unknown as { turnstile?: unknown }).turnstile) {
        resolve();
        return;
      }
      if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onSubscribeTurnstileLoad';
      script.async = true;
      (window as unknown as { onSubscribeTurnstileLoad?: () => void }).onSubscribeTurnstileLoad = () => resolve();
      document.head.appendChild(script);
    });
    return turnstileScript;
  };

  /** A fresh single-use token. An empty site key means Turnstile is
      unconfigured (e2e fixtures, local dev) -- resolve to '' and let the
      server's own `not_configured` answer decide, rather than blocking a
      submission on a widget that will never load. */
  const requestToken = (): Promise<string> => {
    if (!siteKey) return Promise.resolve('');
    if (tokenPromise) return tokenPromise;

    tokenPromise = new Promise<string>((resolve) => {
      settleToken = resolve;
      const settle = (token: string) => settleToken?.(token || '');
      void loadTurnstile().then(() => {
        const turnstile = (window as unknown as { turnstile?: any }).turnstile;
        if (!turnstile) {
          settle('');
          return;
        }
        if (turnstileWidgetId === null) {
          turnstileWidgetId = turnstile.render(turnstileContainer, {
            sitekey: siteKey,
            action: 'notify_subscribe',
            size: 'invisible',
            callback: settle,
            'expired-callback': () => settle(''),
            'error-callback': () => settle(''),
            'timeout-callback': () => settle(''),
          });
        } else {
          turnstile.reset(turnstileWidgetId);
        }
      });
    });

    return tokenPromise;
  };

  /** Tokens are spent server-side on first use -- drop ours after every
      attempt so the next one runs the widget again instead of replaying it. */
  const releaseToken = () => {
    tokenPromise = null;
    settleToken = null;
  };

  const resetForm = () => {
    showView('form');
    errorMsg.textContent = '';
    successText.textContent = t.success;
    isSubmitting = false;
    releaseToken();
    submitSpinner.classList.add('is-hidden');
    submit.removeAttribute('aria-busy');
    syncGate();
  };

  const openPanel = ({ focusEmail = true } = {}) => {
    isOpen = true;
    // Someone who has already commented on this browser has typed their
    // address once today. Hand it back rather than asking again -- the field
    // stays editable, and an untouched field is never overwritten.
    if (!email.value) {
      const known = readReaderEmail();
      if (known) email.value = known.email;
    }
    clearHoverTimer();
    positionPanel();
    panel.classList.add('is-open');
    scrim?.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-active');
    if (focusEmail) email.focus();
    void loadTurnstile();
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
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

    // Asked for after the button is already busy: an invisible challenge
    // normally settles in well under a second, and the spinner is the honest
    // description of that wait.
    const token = await requestToken();

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
        // Hand it to the comment box, which asks for the same thing.
        rememberReaderEmail(value, 'subscribe');
        successText.textContent = data.status === 'already_subscribed' ? t.already : t.success;
        showView('success');
      } else if (response.status === 429) {
        errorMsg.textContent = t.rateLimited;
      } else if (data.code?.startsWith('turnstile')) {
        errorMsg.textContent = t.verifyFailed;
      } else {
        errorText.textContent = data.error || t.error;
        showView('error');
      }
    } catch {
      errorText.textContent = t.network;
      showView('error');
    } finally {
      releaseToken();
      isSubmitting = false;
      submit.removeAttribute('aria-busy');
      submitSpinner.classList.add('is-hidden');
      syncGate();
    }
  });
}

export function initSubscribePanels(): void {
  document.querySelectorAll<HTMLElement>('[data-subscribe-panel]').forEach(setupPanel);
}
