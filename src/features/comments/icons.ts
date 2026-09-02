/* Icon geometry for the comment feature's server-rendered surfaces, copied
   verbatim from lucide-react 1.33.0 -- the icon set already in package.json,
   which the React islands import as components. These pages draw no islands,
   so they need the path data as a string; hand-drawn approximations were what
   they had before, and they read as approximations.

   To refresh or add one, take `__iconNode` from
   node_modules/lucide-react/dist/esm/icons/<name>.mjs and flatten it to
   elements. The paths assume Lucide's 24x24 viewBox and are drawn with
   `fill="none" stroke="currentColor" stroke-linecap="round"
   stroke-linejoin="round"` by the surface that renders them. */

export const ICONS = {
  /** lucide `mail` */
  mail: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  /** lucide `check` */
  check: '<path d="M20 6 9 17l-5-5"/>',
  /** lucide `settings` */
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  /** lucide `send` */
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  /** lucide `bell` */
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  /** lucide `bell-off` */
  bellOff: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742"/><path d="m2 2 20 20"/><path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05"/>',
  /** lucide `link-2-off` -- an expired link, which is what the card is about */
  linkOff: '<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><line x1="8" x2="12" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/>',
  /** lucide `log-out` */
  logOut: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
} as const;

/** The identity strip's sign-out button, both faces, as whole `<svg>` strings:
    three renderers draw this same button (the compose form, the reply box's
    server pass, and the controller's client pass) and they have to agree.
    `armed` is the second-press state -- a tick, because by then the button has
    stopped offering and started asking. */
const svg = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const SIGNOUT_ICONS = {
  idle: svg(ICONS.logOut),
  armed: svg(ICONS.check),
} as const;
