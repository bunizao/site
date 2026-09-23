// Mood embeds: grow the iframe to its real content height.
//
// The embed document posts a {type:'mood-embed-resize', height} message but
// ships no host-side listener, and the markup carries a short fallback height,
// so an unwired frame clips (avatar, title, image cut off). Anywhere the embed
// is rendered — a post, or a `demo` fence in the docs — is a host, hence the
// explicit root instead of a module-level singleton.

export function wireMoodEmbeds(root: ParentNode): void {
  const frames = root.querySelectorAll<HTMLIFrameElement>(
    'iframe.js-mood-embed, iframe[src*="/mood/embed"]',
  );
  if (frames.length === 0) return;

  frames.forEach((frame) => {
    frame.style.height = '120px';
    frame.style.overflow = 'hidden';
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'mood-embed-resize') return;
    const height = Number(data.height);
    if (!Number.isFinite(height)) return;
    frames.forEach((frame) => {
      if (frame.contentWindow && event.source === frame.contentWindow) {
        frame.style.height = `${Math.max(120, Math.ceil(height))}px`;
      }
    });
  });

  // Keep the embed's theme in step with the page (the toggle adds/removes
  // `.dark` on <html>); without this the iframe only follows the OS scheme.
  const theme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const pushTheme = () => {
    frames.forEach((frame) => {
      frame.contentWindow?.postMessage({ type: 'mood-embed-theme', theme: theme() }, '*');
    });
  };
  // An embed that loads off-screen — below the fold, or inside a collapsed
  // `demo` fence in the docs — is render-throttled and its own first height
  // never arrives, leaving the frame at the fallback size for good. Ask for one
  // when it becomes visible, which is also the first moment it can answer.
  //
  // Both triggers are needed and either can come first: a lazy frame starts
  // loading as it scrolls in, so the intersection can beat the document that
  // would answer it, and a frame revealed later (a <details> opening) is
  // already loaded and will never fire `load` again.
  const ask = (frame: HTMLIFrameElement) => {
    frame.contentWindow?.postMessage({ type: 'mood-embed-measure' }, '*');
  };
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) ask(entry.target as HTMLIFrameElement);
    });
  });
  frames.forEach((frame) => {
    frame.addEventListener('load', () => {
      pushTheme();
      ask(frame);
    });
    seen.observe(frame);
  });
  new MutationObserver(pushTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}
