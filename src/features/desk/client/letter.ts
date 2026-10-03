// The letter on the desk (ui/Letter.astro), run by the /message form's own
// client. That client and what it brings (Turnstile, the browser evidence)
// load the first time the letter is on the canvas, not with the page: most
// visits never open it, and the seal stays unpressable until then.
//
// The client flips the hooks; this only listens for two of them, to make the
// noise of the letter going in and to paint what a sent letter shows.
import { play } from './sound';

export function initLetter() {
  const easel = document.querySelector<HTMLElement>('[data-easel]');
  const root = document.querySelector<HTMLElement>('.mx[data-message-root]');
  const typing = root?.querySelector<HTMLElement>('[data-message-typing]');
  const sent = root?.querySelector<HTMLElement>('[data-message-sent-view]');
  if (!easel || !root || !typing || !sent) return;

  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    void import('@/features/messages/client/message-form').then(({ initMessageForm }) => initMessageForm(root));
  };
  easel.addEventListener('easel:shown', (event) => {
    if ((event as CustomEvent<string>).detail === 'note') load();
  });
  if (!root.closest<HTMLElement>('[data-panel]')?.hidden) load();

  new MutationObserver(() => {
    if (!typing.hidden) play('pages');
  }).observe(typing, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => {
    if (sent.hidden) return;
    play('knock');
    root.dispatchEvent(new CustomEvent('easel:repaint', { bubbles: true }));
  }).observe(sent, { attributes: true, attributeFilter: ['hidden'] });
}
