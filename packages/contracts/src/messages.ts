/**
 * Owner messages — the standalone form at /message.
 *
 * This is deliberately NOT the comments contract. A message is private by
 * construction, not by moderation state: there is no `published`, no thread,
 * no parent, no reactions, and no public read endpoint anywhere in this file.
 * The comments stack answers "who may see this row"; here the answer is fixed
 * at the storage layer, so a mis-written WHERE clause cannot leak one.
 *
 * What it does share with comments is everything that lives above the table:
 * Turnstile, the honeypot and dwell tripwires, Akismet, the risk heuristics,
 * reader identity, and the ops-bot notification. See site-api's
 * features/messages/server/message-service.ts.
 */

export const MESSAGE_LOCALES = ['zh', 'en'] as const;
export type MessageLocale = (typeof MESSAGE_LOCALES)[number];

/** Body bounds, shared by the form's client-side validation and the service. */
export const MESSAGE_MIN_BODY_LENGTH = 2;
export const MESSAGE_MAX_BODY_LENGTH = 4000;
export const MESSAGE_MAX_NAME_LENGTH = 32;

/**
 * Triage, not moderation. Every value here is private; none of them makes a
 * message visible to anyone but the owner, which is why there is no
 * `published` member to accidentally set.
 *
 *   new      — landed, not yet looked at
 *   read     — the owner has seen it
 *   replied  — answered from Telegram; `repliedAt` is set
 *   archived — filed away by the owner
 *   spam     — the risk stack or Akismet called it; never notified loudly
 */
export const MESSAGE_STATES = ['new', 'read', 'replied', 'archived', 'spam'] as const;
export type MessageState = (typeof MESSAGE_STATES)[number];

export interface OwnerMessageCreateInput {
  /** Plain text, MESSAGE_MIN_BODY_LENGTH–MESSAGE_MAX_BODY_LENGTH characters. */
  body: string;
  displayName: string;
  /**
   * Optional, and optional on purpose — the same "channeling beats blocking"
   * call the comment box makes. Supplied, it must be valid: it triggers the
   * shared lazy-verification mail, and only a verified address can ever
   * receive the owner's reply.
   */
  email?: string;
  turnstileToken: string;
  /** Minted by the form on load; proves the submit was not instant. */
  dwellToken: string;
  /** Honeypot. Any non-empty value is a silent drop. */
  website?: string;
  locale?: MessageLocale;
}

export interface OwnerMessageCreateResult {
  id: string;
  createdAt: string;
  /**
   * Whether the owner's reply can actually reach the sender. True only when
   * the address belongs to a verified reader — an address typed into a public
   * form is not proof that its owner sent anything, so an unverified one is
   * never mailed. False also when no address was given at all; the form uses
   * this to decide whether the receipt promises a reply or not.
   */
  replyable: boolean;
  /**
   * A verification mail just went out to a not-yet-verified address. The
   * receipt tells the sender to click it if they want an answer.
   */
  verificationSent: boolean;
}
