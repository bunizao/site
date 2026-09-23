interface TurnstileApi {
  render: (...args: any[]) => string;
  reset: (...args: any[]) => void;
  getResponse?: (...args: any[]) => string;
  /** Tears a widget down completely. The only way to change a widget's
      `appearance`, which is fixed at render time -- see challengeTurnstile. */
  remove?: (...args: any[]) => void;
}

let readiness: Promise<TurnstileApi | null> | null = null;

function currentApi(): TurnstileApi | null {
  const api = (window as unknown as { turnstile?: Partial<TurnstileApi> }).turnstile;
  return api && typeof api.render === 'function' && typeof api.reset === 'function'
    ? api as TurnstileApi
    : null;
}

/** One readiness promise for every Turnstile consumer on the page. An
    existing script tag is not proof that its API is ready, so wait for the
    actual global and close the load-listener race with a bounded poll. */
export function loadTurnstileScript(): Promise<TurnstileApi | null> {
  if (readiness) return readiness;

  readiness = new Promise((resolve) => {
    const ready = currentApi();
    if (ready) {
      resolve(ready);
      return;
    }

    let script = document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      document.head.appendChild(script);
    }

    let finished = false;
    let poll = 0;
    const settle = (api: TurnstileApi | null) => {
      if (finished) return;
      finished = true;
      window.clearInterval(poll);
      resolve(api);
    };
    const check = () => {
      const api = currentApi();
      if (api) settle(api);
    };

    script.addEventListener('load', check, { once: true });
    script.addEventListener('error', () => settle(null), { once: true });
    check();
    poll = window.setInterval(check, 25);
    window.setTimeout(() => settle(currentApi()), 10_000);
  });

  return readiness;
}
