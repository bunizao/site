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
  /** lucide `heart` */
  heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  /** lucide `reply` */
  reply: '<path d="M20 18v-2a4 4 0 0 0-4-4H4"/><path d="m9 17-5-5 5-5"/>',
  /** lucide `pencil` */
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  /** lucide `trash-2` */
  trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  /** lucide `circle-slash` -- the avatar a deleted comment leaves behind */
  circleSlash: '<circle cx="12" cy="12" r="10"/><line x1="9" x2="15" y1="15" y2="9"/>',
  /** lucide `circle-alert` */
  circleAlert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  /** lucide `arrow-up` -- the compose send button */
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  /** lucide `x` */
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  /** lucide `message-square-warning` -- the thread failed to load */
  messageSquareWarning: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 15h.01"/><path d="M12 7v4"/>',
  /** lucide `message-square-off` -- comments are closed on this post */
  messageSquareOff: '<path d="M19 19H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 1.184-1.826"/><path d="m2 2 20 20"/><path d="M8.656 3H20a2 2 0 0 1 2 2v11.344"/>',
  /** lucide `log-out` */
  logOut: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
} as const;

/** Path data wrapped in the 24x24 frame these surfaces draw it in. Astro
    templates inline their own `<svg>` and pass paths through `set:html`; this
    is for the client controller, which has to build whole elements from
    strings. `attrs` carries what a single call site differs by -- a class, a
    heavier stroke. */
export const iconSvg = (paths: string, attrs = 'stroke-width="1.6"'): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ${attrs} aria-hidden="true">${paths}</svg>`;

/** The identity strip's sign-out button, both faces, as whole `<svg>` strings:
    three renderers draw this same button (the compose form, the reply box's
    server pass, and the controller's client pass) and they have to agree.
    `armed` is the second-press state -- a tick, because by then the button has
    stopped offering and started asking. */
export const SIGNOUT_ICONS = {
  idle: iconSvg(ICONS.logOut),
  armed: iconSvg(ICONS.check),
} as const;
