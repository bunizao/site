// Drives every .subscribe-panel on the page: open/close from its trigger,
// position it against that trigger, run the Turnstile gate, and submit the
// form. One controller serves both the mood feed and the blog — they share the
// markup in SubscribePanel.astro and differ only by `channels` and copy.
//
// Pages never render more than one panel, but the controller loops so a panel
// + trigger pair are matched by id, keeping it placement-agnostic.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUCCESS_TEXT = '确认邮件已发，去收件箱点一下。';
const ALREADY_TEXT = '已经订阅过了。';
const LOCKED_HINT = '请先完成安全校验。';
const LOCKED_HINT_FAILED = '校验失败，重试一下。';

const MOBILE_BREAKPOINT = 640;
const MOBILE_PANEL_PADDING = 10;
const MOBILE_PANEL_MIN_TOP = 72;
const HOVER_CLOSE_DELAY_MS = 140;

function setupPanel(panel: HTMLElement): void {
  const id = panel.dataset.subscribeId || '';
  const toggle = document.querySelector<HTMLElement>(`[data-subscribe-toggle="${id}"]`);
  if (!toggle) return;

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
  const submitLock = panel.querySelector<HTMLElement>('[data-sub-submit-lock]')!;
  const submitSpinner = panel.querySelector<HTMLElement>('[data-sub-submit-spinner]')!;
  const hint = panel.querySelector<HTMLElement>('[data-sub-hint]')!;
  const errorMsg = panel.querySelector<HTMLElement>('[data-sub-error]')!;
  const successText = panel.querySelector<HTMLElement>('[data-sub-success-text]')!;
  const errorText = panel.querySelector<HTMLElement>('[data-sub-error-text]')!;
  const doneBtn = panel.querySelector<HTMLButtonElement>('[data-sub-done]')!;
  const retryBtn = panel.querySelector<HTMLButtonElement>('[data-sub-retry]')!;
  const turnstileContainer = panel.querySelector<HTMLElement>('[data-sub-turnstile]')!;

  const anchor = panel.dataset.anchor === 'left' ? 'left' : 'right';
  const siteKey = panel.dataset.turnstileSiteKey || '';
  const requiresTurnstile = Boolean(siteKey);
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  let turnstileWidgetId: string | null = null;
  let turnstileReady = false;
  let turnstileToken = '';
  let isSubmitting = false;
  let lockedHint = LOCKED_HINT;
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

  const setHint = (message: string) => {
    hint.textContent = message;
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
    const verified = !requiresTurnstile || Boolean(turnstileToken);
    submit.disabled = !verified || isSubmitting;
    submit.classList.toggle('is-locked', !verified);
    submitLock.classList.toggle('is-hidden', verified || isSubmitting);
    setHint(!requiresTurnstile || verified ? '' : lockedHint);
  };

  const renderTurnstile = () => {
    const turnstile = (window as unknown as { turnstile?: any }).turnstile;
    if (!siteKey || !turnstileReady || !turnstile || turnstileWidgetId !== null) return;
    turnstileContainer.classList.add('has-widget');
    turnstileWidgetId = turnstile.render(turnstileContainer, {
      sitekey: siteKey,
      action: 'notify_subscribe',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      size: 'normal',
      callback: (token: string) => {
        turnstileToken = token || '';
        errorMsg.textContent = '';
        lockedHint = LOCKED_HINT;
        syncGate();
      },
      'expired-callback': () => {
        turnstileToken = '';
        lockedHint = LOCKED_HINT_FAILED;
        syncGate();
      },
      'error-callback': () => {
        turnstileToken = '';
        lockedHint = LOCKED_HINT_FAILED;
        syncGate();
      },
      'timeout-callback': () => {
        turnstileToken = '';
        lockedHint = LOCKED_HINT_FAILED;
        syncGate();
      },
    });
  };

  const loadTurnstile = () => {
    if (!siteKey || turnstileReady) return;
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      turnstileReady = true;
      renderTurnstile();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onSubscribeTurnstileLoad';
    script.async = true;
    (window as unknown as { onSubscribeTurnstileLoad?: () => void }).onSubscribeTurnstileLoad = () => {
      turnstileReady = true;
      renderTurnstile();
    };
    document.head.appendChild(script);
  };

  const resetTurnstile = (nextHint: string = LOCKED_HINT) => {
    const turnstile = (window as unknown as { turnstile?: any }).turnstile;
    if (turnstileWidgetId !== null && turnstile) {
      turnstile.reset(turnstileWidgetId);
    }
    turnstileToken = '';
    lockedHint = nextHint;
    syncGate();
  };

  const getToken = (): string => {
    if (turnstileToken) return turnstileToken;
    const turnstile = (window as unknown as { turnstile?: any }).turnstile;
    if (turnstileWidgetId !== null && turnstile) {
      turnstileToken = turnstile.getResponse(turnstileWidgetId) || '';
    }
    return turnstileToken;
  };

  const resetForm = () => {
    showView('form');
    errorMsg.textContent = '';
    successText.textContent = SUCCESS_TEXT;
    isSubmitting = false;
    lockedHint = LOCKED_HINT;
    submitSpinner.classList.add('is-hidden');
    submit.removeAttribute('aria-busy');
    syncGate();
  };

  const openPanel = ({ focusEmail = true } = {}) => {
    isOpen = true;
    clearHoverTimer();
    positionPanel();
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-active');
    if (focusEmail) email.focus();
    loadTurnstile();
  };

  const closePanel = () => {
    clearHoverTimer();
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('is-open');
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
  retryBtn.addEventListener('click', () => {
    resetForm();
    resetTurnstile();
  });

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
      errorMsg.textContent = '请输入有效的邮箱地址。';
      email.focus();
      return;
    }

    const channels = channelInputs.filter((input) => input.checked).map((input) => input.value);
    if (channels.length === 0) {
      errorMsg.textContent = '请至少选择一个订阅内容。';
      return;
    }

    const token = getToken();
    if (requiresTurnstile && !token) {
      lockedHint = LOCKED_HINT;
      syncGate();
      return;
    }

    errorMsg.textContent = '';
    isSubmitting = true;
    syncGate();
    submit.setAttribute('aria-busy', 'true');
    submitSpinner.classList.remove('is-hidden');

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
        successText.textContent = data.status === 'already_subscribed' ? ALREADY_TEXT : SUCCESS_TEXT;
        showView('success');
      } else if (response.status === 429) {
        resetTurnstile();
        errorMsg.textContent = '太频繁了，稍后再试。';
      } else if (data.code?.startsWith('turnstile')) {
        resetTurnstile(LOCKED_HINT_FAILED);
      } else {
        errorText.textContent = data.error || '出错了，稍后重试。';
        showView('error');
      }
    } catch {
      errorText.textContent = '网络错误，检查下连接。';
      showView('error');
    } finally {
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
