const DEFAULT_POLL_MS = 1_500;
const MAX_RETRY_MS = 30_000;
const SCROLL_KEY_PREFIX = 'buxx:ghost-draft-scroll:';

function previewEtag(revision: string): string {
  return JSON.stringify(revision);
}

function scrollKey(): string {
  return `${SCROLL_KEY_PREFIX}${window.location.pathname}${window.location.search}`;
}

function restoreScroll(): void {
  const scroller = document.querySelector<HTMLElement>('[data-page-scroller]');
  if (!scroller) return;

  try {
    const raw = sessionStorage.getItem(scrollKey());
    if (raw === null) return;
    sessionStorage.removeItem(scrollKey());
    const target = Number(raw);
    if (!Number.isFinite(target) || target < 0) return;
    requestAnimationFrame(() => {
      scroller.scrollTop = target;
    });
  } catch {
    // Live reload still works when session storage is unavailable.
  }
}

function saveScroll(): void {
  const scroller = document.querySelector<HTMLElement>('[data-page-scroller]');
  if (!scroller) return;

  try {
    sessionStorage.setItem(scrollKey(), String(scroller.scrollTop));
  } catch {
    // Losing scroll restoration must not block a fresh preview.
  }
}

function setStatus(root: HTMLElement, message: string, state: string): void {
  root.dataset.previewState = state;
  const status = root.querySelector<HTMLElement>('[data-ghost-draft-live-status]');
  if (status) status.textContent = message;
}

function hasActiveMedia(root: HTMLElement): boolean {
  if (root.querySelector('[data-blog-music].is-playing')) return true;
  return [...root.querySelectorAll<HTMLMediaElement>('audio, video')]
    .some((media) => !media.paused && !media.ended);
}

export function startGhostDraftLiveReload(root: HTMLElement): () => void {
  const revision = root.dataset.previewRevision;
  if (!revision) return () => {};

  restoreScroll();
  const configuredPollMs = Number(root.dataset.previewPollMs);
  const pollMs = Number.isFinite(configuredPollMs) && configuredPollMs > 0
    ? configuredPollMs
    : DEFAULT_POLL_MS;
  const currentEtag = previewEtag(revision);
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const schedule = (delay: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void probe(), delay);
  };

  const probe = async () => {
    if (stopped) return;
    if (document.visibilityState !== 'visible') {
      schedule(pollMs);
      return;
    }

    controller = new AbortController();
    try {
      const response = await fetch(window.location.href, {
        method: 'HEAD',
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { 'If-None-Match': currentEtag },
      });

      if (response.status === 304) {
        failures = 0;
        setStatus(root, 'Live preview', 'live');
        schedule(pollMs);
        return;
      }

      if (response.ok) {
        const nextEtag = response.headers.get('ETag');
        if (nextEtag && nextEtag !== currentEtag) {
          if (hasActiveMedia(root)) {
            setStatus(root, 'Draft updated — waiting for playback', 'pending');
            schedule(pollMs);
            return;
          }
          setStatus(root, 'Updating preview…', 'updating');
          saveScroll();
          stopped = true;
          window.location.reload();
          return;
        }
      }

      throw new Error(`Unexpected preview probe response: ${response.status}`);
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === 'AbortError')) return;
      failures += 1;
      setStatus(root, 'Preview update delayed — retrying', 'retrying');
      schedule(Math.min(pollMs * 2 ** failures, MAX_RETRY_MS));
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') schedule(0);
  };
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller?.abort();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', stop, { once: true });
  schedule(pollMs);
  return stop;
}
