export function initMoodNotifyPanel(): void {
  const panel = document.querySelector('.notify-panel') as HTMLElement | null;
  const toggleBtn = document.querySelector('[data-notify-toggle]') as HTMLButtonElement | null;
  if (!panel || !toggleBtn) return;

  const formView = panel.querySelector('[data-notify-form-view]') as HTMLElement;
  const successView = panel.querySelector('[data-notify-success-view]') as HTMLElement;
  const errorView = panel.querySelector('[data-notify-error-view]') as HTMLElement;
  const closeBtn = panel.querySelector('[data-notify-close]') as HTMLButtonElement;
  const form = panel.querySelector('[data-notify-form]') as HTMLFormElement;
  const emailInput = panel.querySelector('[data-notify-email]') as HTMLInputElement;
  const submitBtn = panel.querySelector('[data-notify-submit]') as HTMLButtonElement;
  const submitText = panel.querySelector('[data-notify-submit-text]') as HTMLElement;
  const submitLockIcon = panel.querySelector('[data-notify-submit-lock]') as HTMLElement | null;
  const submitSpinner = panel.querySelector('[data-notify-submit-spinner]') as HTMLElement;
  const submitHint = panel.querySelector('[data-notify-submit-hint]') as HTMLElement;
  const successText = panel.querySelector('[data-notify-success-text]') as HTMLElement;
  const errorMsg = panel.querySelector('[data-notify-error-msg]') as HTMLElement;
  const doneBtn = panel.querySelector('[data-notify-done]') as HTMLButtonElement;
  const retryBtn = panel.querySelector('[data-notify-retry]') as HTMLButtonElement;
  const errorStateText = panel.querySelector('[data-notify-error-state-text]') as HTMLElement;
  const turnstileContainer = panel.querySelector('[data-notify-turnstile]') as HTMLElement;
  const deliveryModeGroup = panel.querySelector('.notify-radio-group') as HTMLElement | null;
  const deliveryModeInputs = Array.from(
    panel.querySelectorAll('input[name="deliveryMode"]')
  ) as HTMLInputElement[];

  const DEFAULT_SUCCESS_TEXT = 'Check your inbox to confirm.';
  const ALREADY_SUBSCRIBED_TEXT = 'This email is already subscribed.';
  const SUBMIT_LABEL = 'Subscribe';
  const DEFAULT_LOCKED_HINT = 'Complete security check before subscribing.';
  const FAILED_LOCKED_HINT = 'Security check failed. Retry to continue.';

  const siteKey = panel.dataset.turnstileSiteKey || '';
  const requiresTurnstile = Boolean(siteKey);
  let turnstileWidgetId: string | null = null;
  let turnstileReady = false;
  let turnstileToken = '';
  let isSubmitting = false;
  let lockedHintMessage = DEFAULT_LOCKED_HINT;
  let isOpen = false;
  let hoverCloseTimer: number | null = null;
  const MOBILE_BREAKPOINT = 640;
  const MOBILE_PANEL_MAX_WIDTH = 312;
  const MOBILE_PANEL_PADDING = 10;
  const MOBILE_PANEL_MIN_TOP = 72;
  const HOVER_CLOSE_DELAY_MS = 140;
  const supportsHoverOpen = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const currentUrl = new URL(window.location.href);
  const subscribeParam = (currentUrl.searchParams.get('subscribe') ?? '').trim().toLowerCase();
  const shouldAutoOpenSubscribe = currentUrl.searchParams.has('subscribe')
    && !['0', 'false', 'no', 'off'].includes(subscribeParam);
  const isFormViewActive = () => !formView.classList.contains('is-hidden');

  const clearHoverCloseTimer = () => {
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
    const rect = toggleBtn.getBoundingClientRect();
    const isMobileViewport = window.innerWidth < MOBILE_BREAKPOINT;

    if (isMobileViewport) {
      const panelWidth = Math.min(window.innerWidth - MOBILE_PANEL_PADDING * 2, MOBILE_PANEL_MAX_WIDTH);
      const centeredLeft = Math.max(
        MOBILE_PANEL_PADDING,
        Math.round((window.innerWidth - panelWidth) / 2),
      );

      panel.style.width = `${panelWidth}px`;
      panel.style.left = `${centeredLeft}px`;
      panel.style.right = 'auto';
      panel.style.top = `${Math.max(rect.bottom + 8, MOBILE_PANEL_MIN_TOP)}px`;
      panel.style.transformOrigin = 'top center';
      return;
    }

    panel.style.removeProperty('width');
    panel.style.removeProperty('left');
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.style.top = `${rect.bottom + 6}px`;
    panel.style.transformOrigin = 'top right';
  };

  const setSubmitHint = (message: string): void => {
    submitHint.textContent = message;
    submitHint.classList.toggle('is-hidden', !message);
  };

  const setLockedHintMessage = (message: string = DEFAULT_LOCKED_HINT): void => {
    lockedHintMessage = message;
  };

  const syncSubmitGate = (): void => {
    const verified = !requiresTurnstile || Boolean(turnstileToken);
    const canSubmit = verified && !isSubmitting;
    submitBtn.disabled = !canSubmit;
    submitBtn.classList.toggle('is-locked', !verified);
    submitText.textContent = SUBMIT_LABEL;
    if (submitLockIcon) {
      submitLockIcon.classList.toggle('is-hidden', verified || isSubmitting);
    }
    if (!requiresTurnstile) {
      setSubmitHint('');
      return;
    }
    if (verified) {
      setSubmitHint('');
      return;
    }
    setSubmitHint(lockedHintMessage);
  };

  const closePanel = () => {
    clearHoverCloseTimer();
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.classList.remove('is-active');
    setTimeout(() => {
      if (!isOpen) {
        showView('form');
        errorMsg.textContent = '';
        successText.textContent = DEFAULT_SUCCESS_TEXT;
        isSubmitting = false;
        setLockedHintMessage(DEFAULT_LOCKED_HINT);
        syncSubmitGate();
        submitText.classList.remove('is-hidden');
        submitSpinner.classList.add('is-hidden');
      }
    }, 200);
  };

  const scheduleHoverClose = () => {
    if (!supportsHoverOpen) return;
    clearHoverCloseTimer();
    hoverCloseTimer = window.setTimeout(() => {
      if (!isFormViewActive()) return;
      const panelHovered = panel.matches(':hover');
      const buttonHovered = toggleBtn.matches(':hover');
      const panelFocused = panel.contains(document.activeElement);
      if (!panelHovered && !buttonHovered && !panelFocused) {
        closePanel();
      }
    }, HOVER_CLOSE_DELAY_MS);
  };

  const syncFrequencyIndicator = () => {
    if (!deliveryModeGroup || deliveryModeInputs.length === 0) return;
    const checkedIndex = deliveryModeInputs.findIndex((input) => input.checked);
    const safeIndex = checkedIndex >= 0 ? checkedIndex : 0;
    deliveryModeGroup.style.setProperty('--notify-frequency-segments', String(deliveryModeInputs.length));
    deliveryModeGroup.style.setProperty('--notify-frequency-offset', `${safeIndex * 100}%`);
  };

  deliveryModeInputs.forEach((input) => {
    input.addEventListener('change', syncFrequencyIndicator);
  });
  syncFrequencyIndicator();

  const renderTurnstile = () => {
    if (!siteKey || !turnstileReady || !(window as any).turnstile) return;
    if (turnstileWidgetId !== null) return;
    turnstileContainer.classList.add('has-widget');
    turnstileWidgetId = (window as any).turnstile.render(turnstileContainer, {
      sitekey: siteKey,
      action: 'notify_subscribe',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      size: 'normal',
      callback: (token: string) => {
        turnstileToken = token || '';
        errorMsg.textContent = '';
        setLockedHintMessage(DEFAULT_LOCKED_HINT);
        syncSubmitGate();
      },
      'expired-callback': () => {
        turnstileToken = '';
        errorMsg.textContent = '';
        setLockedHintMessage(FAILED_LOCKED_HINT);
        syncSubmitGate();
      },
      'error-callback': () => {
        turnstileToken = '';
        errorMsg.textContent = '';
        setLockedHintMessage(FAILED_LOCKED_HINT);
        syncSubmitGate();
      },
      'timeout-callback': () => {
        turnstileToken = '';
        errorMsg.textContent = '';
        setLockedHintMessage(FAILED_LOCKED_HINT);
        syncSubmitGate();
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
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
    script.async = true;
    (window as any).onTurnstileLoad = () => {
      turnstileReady = true;
      renderTurnstile();
    };
    document.head.appendChild(script);
  };

  const resetTurnstile = (
    hintMessage: string = DEFAULT_LOCKED_HINT,
    options: { clearError?: boolean } = {}
  ) => {
    const { clearError = true } = options;
    if (turnstileWidgetId !== null && (window as any).turnstile) {
      (window as any).turnstile.reset(turnstileWidgetId);
    }
    turnstileToken = '';
    if (clearError) {
      errorMsg.textContent = '';
    }
    setLockedHintMessage(hintMessage);
    syncSubmitGate();
  };

  const getTurnstileToken = (): string => {
    if (turnstileToken) {
      return turnstileToken;
    }
    if (turnstileWidgetId !== null && (window as any).turnstile) {
      const response = (window as any).turnstile.getResponse(turnstileWidgetId) || '';
      if (response) {
        turnstileToken = response;
      }
      return response;
    }
    return '';
  };

  const openPanel = ({ focusEmail = true }: { focusEmail?: boolean } = {}) => {
    isOpen = true;
    clearHoverCloseTimer();
    positionPanel();
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.classList.add('is-active');
    if (focusEmail) {
      emailInput.focus();
    }
    loadTurnstile();
  };

  toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isOpen) closePanel();
    else openPanel({ focusEmail: true });
  });

  if (supportsHoverOpen) {
    toggleBtn.addEventListener('mouseenter', () => {
      openPanel({ focusEmail: false });
    });
    toggleBtn.addEventListener('mouseleave', () => {
      scheduleHoverClose();
    });
    panel.addEventListener('mouseenter', () => {
      clearHoverCloseTimer();
    });
    panel.addEventListener('mouseleave', () => {
      scheduleHoverClose();
    });
  }

  closeBtn.addEventListener('click', () => closePanel());
  doneBtn.addEventListener('click', () => closePanel());
  retryBtn.addEventListener('click', () => {
    showView('form');
    errorMsg.textContent = '';
    resetTurnstile();
    syncSubmitGate();
  });

  document.addEventListener('click', (event) => {
    if (isOpen && !panel.contains(event.target as Node) && !toggleBtn.contains(event.target as Node)) {
      closePanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      closePanel();
      toggleBtn.focus();
    }
  });

  let repositionRaf: number;
  const handleReposition = () => {
    if (!isOpen) return;
    cancelAnimationFrame(repositionRaf);
    repositionRaf = requestAnimationFrame(positionPanel);
  };
  window.addEventListener('scroll', handleReposition, { passive: true });
  window.addEventListener('resize', handleReposition, { passive: true });

  if (shouldAutoOpenSubscribe) {
    requestAnimationFrame(() => {
      openPanel({ focusEmail: true });
    });

    currentUrl.searchParams.delete('subscribe');
    const nextSearch = currentUrl.searchParams.toString();
    const nextUrl = `${currentUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${currentUrl.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }

  syncSubmitGate();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorMsg.textContent = 'Please enter a valid email address.';
      return;
    }

    const deliveryMode = (form.querySelector('input[name="deliveryMode"]:checked') as HTMLInputElement)?.value || 'instant';
    const token = getTurnstileToken();
    if (requiresTurnstile && !token) {
      errorMsg.textContent = '';
      setLockedHintMessage(DEFAULT_LOCKED_HINT);
      syncSubmitGate();
      return;
    }

    errorMsg.textContent = '';
    isSubmitting = true;
    syncSubmitGate();
    submitBtn.setAttribute('aria-busy', 'true');
    submitText.classList.add('is-hidden');
    submitSpinner.classList.remove('is-hidden');

    try {
      const response = await fetch('/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          deliveryMode,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          turnstileToken: token,
        }),
      });

      const data = await response.json() as {
        status?: string;
        code?: string;
        error?: string;
      };

      if (response.ok) {
        successText.textContent =
          data.status === 'already_subscribed' ? ALREADY_SUBSCRIBED_TEXT : DEFAULT_SUCCESS_TEXT;
        showView('success');
      } else if (response.status === 429) {
        resetTurnstile(DEFAULT_LOCKED_HINT, { clearError: false });
        errorMsg.textContent = 'Too many requests. Please try again later.';
      } else if (data.code?.startsWith('turnstile')) {
        resetTurnstile(FAILED_LOCKED_HINT);
      } else {
        errorStateText.textContent = data.error || 'Something went wrong.';
        showView('error');
      }
    } catch {
      errorStateText.textContent = 'Network error. Please check your connection.';
      showView('error');
    } finally {
      isSubmitting = false;
      syncSubmitGate();
      submitBtn.removeAttribute('aria-busy');
      submitText.classList.remove('is-hidden');
      submitSpinner.classList.add('is-hidden');
    }
  });
}
