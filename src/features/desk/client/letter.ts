// The letter on the desk (ui/Letter.astro), run by the /message form's own
// client. That client and what it brings (Turnstile, the browser evidence)
// load the first time the letter is on the canvas, not with the page: most
// visits never open it, and the seal stays unpressable until then. Opening
// the letter is a plain wish to write one, so Turnstile starts settling
// then, not at the first key: a short note goes without waiting on it, and a
// visitor Cloudflare wants to see is asked before writing, not after.
//
// The client flips the hooks; this listens for two of them, to make the
// noise of the letter going in and to paint what a sent letter shows. It
// also dates the letter by the writer's own day, and warms the seal once the
// letter has all it needs to go.
import { MESSAGE_MAX_BODY_LENGTH, MESSAGE_MIN_BODY_LENGTH } from '@bunizao/contracts/messages';
import { play } from './sound';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initLetter() {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const root = document.querySelector<HTMLElement>('.mx[data-message-root]');
  const form = root?.querySelector<HTMLFormElement>('[data-message-form]');
  const typing = root?.querySelector<HTMLElement>('[data-message-typing]');
  const sent = root?.querySelector<HTMLElement>('[data-message-sent-view]');
  if (!easel || !root || !form || !typing || !sent) return;

  const siteKey = root.dataset.turnstileSiteKey ?? '';
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    void Promise.all([
      import('@/features/messages/client/message-form'),
      import('@/features/comments/client/turnstile-token'),
    ]).then(([{ initMessageForm }, { warmTurnstileToken }]) => {
      initMessageForm(root);
      if (siteKey) warmTurnstileToken(siteKey, 'owner_message_create');
    });
  };
  easel.addEventListener('easel:shown', (event) => {
    if ((event as CustomEvent<string>).detail === 'note') load();
  });
  if (!root.closest<HTMLElement>('[data-panel]')?.hidden) load();

  const date = root.querySelector<HTMLElement>('[data-letter-date]');
  const stamp = root.querySelector<HTMLElement>('[data-letter-stamp]');
  const today = (month: 'long' | 'short') => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month, year: 'numeric' }).format(new Date());
  if (date) date.textContent = today('long');

  // Ready: written, signed, and somewhere to write back to. The seal is
  // pressable either way, and says what is missing when pressed too soon.
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
  const check = () => {
    const body = field('body')?.value.trim().length ?? 0;
    const ready =
      body >= MESSAGE_MIN_BODY_LENGTH &&
      body <= MESSAGE_MAX_BODY_LENGTH &&
      Boolean(field('displayName')?.value.trim()) &&
      EMAIL.test(field('email')?.value.trim() ?? '');
    root.classList.toggle('is-ready', ready);
  };
  form.addEventListener('input', check);
  form.addEventListener('reset', () => requestAnimationFrame(check));
  check();

  new MutationObserver(() => {
    if (typing.hidden) return;
    if (stamp) stamp.textContent = today('short');
    play('pages');
  }).observe(typing, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => {
    if (sent.hidden) return;
    play('knock');
    root.dispatchEvent(new CustomEvent('easel:repaint', { bubbles: true }));
  }).observe(sent, { attributes: true, attributeFilter: ['hidden'] });
}
