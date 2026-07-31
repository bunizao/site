const PROBE_TIMEOUT_MS = 5_000;
const VERDICT_KEY = 'youtube-embed-reachable:v1';
const PLACEHOLDER_MAX_WIDTH = 120;

type ReachabilityVerdict = 'yes' | 'no';

function readVerdict(): ReachabilityVerdict | null {
  try {
    const value = sessionStorage.getItem(VERDICT_KEY);
    return value === 'yes' || value === 'no' ? value : null;
  } catch {
    return null;
  }
}

function writeVerdict(value: ReachabilityVerdict): void {
  try {
    sessionStorage.setItem(VERDICT_KEY, value);
  } catch {
    // Storage is an optimization. Playback still works when it is unavailable.
  }
}

function isYouTubeMessageOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    return origin.protocol === 'https:' && [
      'youtube.com',
      'www.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
    ].includes(origin.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function mountPoster(card: HTMLElement): void {
  const poster = card.querySelector('[data-yt-poster]');
  if (!(poster instanceof HTMLImageElement) || poster.dataset.ytPosterBound === 'true') return;

  poster.dataset.ytPosterBound = 'true';
  const fallbackUrl = poster.dataset.ytPosterFallback;
  let fellBack = poster.src === new URL(fallbackUrl ?? '', window.location.href).href;

  const fallback = () => {
    if (fellBack || !fallbackUrl) return;
    fellBack = true;
    poster.src = fallbackUrl;
  };
  const inspect = () => {
    if (poster.naturalWidth > 0 && poster.naturalWidth <= PLACEHOLDER_MAX_WIDTH) {
      fallback();
    }
  };

  poster.addEventListener('load', inspect);
  poster.addEventListener('error', fallback, { once: true });
  if (poster.complete) queueMicrotask(inspect);
}

function markUnreachable(card: HTMLElement, player: HTMLIFrameElement): void {
  player.removeAttribute('src');
  player.hidden = true;
  card.classList.remove('is-loading', 'is-playing');
  card.classList.add('is-unreachable');
}

function play(card: HTMLElement): void {
  if (
    card.classList.contains('is-playing')
    || card.classList.contains('is-loading')
    || card.classList.contains('is-unreachable')
  ) {
    return;
  }

  const player = card.querySelector('[data-yt-player]');
  if (!(player instanceof HTMLIFrameElement)) return;
  const iframe: HTMLIFrameElement = player;

  if (readVerdict() === 'no' || !/^https?:$/u.test(window.location.protocol)) {
    markUnreachable(card, player);
    return;
  }

  const id = card.dataset.video ?? '';
  const start = card.dataset.start ?? '0';
  const params = new URLSearchParams({
    autoplay: '1',
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    start,
    origin: window.location.origin,
  });

  card.classList.add('is-loading');
  player.hidden = false;

  let settled = false;
  let timer = 0;
  const cleanup = () => {
    window.clearTimeout(timer);
    window.removeEventListener('message', onMessage);
  };
  const fail = (networkFailure: boolean) => {
    if (settled) return;
    settled = true;
    cleanup();
    markUnreachable(card, player);
    if (networkFailure) writeVerdict('no');
  };
  const succeed = () => {
    if (settled) return;
    settled = true;
    cleanup();
    card.classList.remove('is-loading', 'is-unreachable');
    card.classList.add('is-playing');
    writeVerdict('yes');
  };
  function onMessage(event: MessageEvent): void {
    if (!isYouTubeMessageOrigin(event.origin) || event.source !== iframe.contentWindow) return;

    let payload: unknown;
    try {
      payload = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object' || !('event' in payload)) return;

    const eventName = (payload as { event?: unknown }).event;
    if (eventName === 'onError') {
      fail(false);
    } else if (eventName === 'onReady') {
      succeed();
    }
  }

  timer = window.setTimeout(() => fail(true), PROBE_TIMEOUT_MS);
  window.addEventListener('message', onMessage);
  iframe.addEventListener('load', () => {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      'https://www.youtube-nocookie.com',
    );
  }, { once: true });
  iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

export function initYouTubeEmbeds(root: ParentNode = document): void {
  root.querySelectorAll('[data-yt]').forEach((node) => {
    if (!(node instanceof HTMLElement) || node.dataset.ytBound === 'true') return;

    const frame = node.querySelector('[data-yt-frame]');
    if (!(frame instanceof HTMLButtonElement)) return;

    node.dataset.ytBound = 'true';
    mountPoster(node);
    frame.addEventListener('click', () => play(node));
  });
}
