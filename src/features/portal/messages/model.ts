import type { AdminClusterCount, AdminCommentActor, AdminOwnerMessage } from '@bunizao/contracts';
import { KEY_KINDS, KEY_ORDER, asnRow, keyValue, type RecordRow } from '../comments/model';

/* What the message pane says about who sent a message. One rule runs
   through it: only a signed-in write ties a message to a reader. An address
   that merely resolves to one was typed, and anybody can type it. */

/** The meta line's word on the sender. */
export function senderLabel(message: AdminOwnerMessage): string {
  if (message.authAtWrite === 'verified') return 'Signed-in reader';
  // An older row does not say whether its sender was signed in.
  if (message.readerId) return message.authAtWrite === 'anonymous' ? 'Typed a reader’s address' : 'A reader’s address';
  return message.emailHash ? 'Gave an address' : 'No address';
}

function plural(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? '' : 's'}`;
}

/** What shares a key, this message included: the pivot link's text, null
    when this message is the only one, undefined when nothing counted it. */
export function tally(cluster: AdminClusterCount | undefined): string | null | undefined {
  if (!cluster) return undefined;
  const messages = (cluster.messages ?? 0) + 1;
  const parts = [
    cluster.comments > 0 && plural(cluster.comments, 'comment'),
    cluster.reactions > 0 && plural(cluster.reactions, 'reaction'),
    messages > 1 && plural(messages, 'message'),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function keyRow(actor: AdminCommentActor, name: (typeof KEY_ORDER)[number], label = KEY_KINDS[name].label, explain = KEY_KINDS[name].explain): RecordRow | null {
  const key = actor.keys[name];
  if (!key) return null;
  const kind = KEY_KINDS[name];
  return {
    id: name,
    label,
    value: keyValue(actor, name),
    explain,
    pivot: { type: kind.source, value: key },
    count: null,
    held: null,
    tally: tally(actor.cluster[name]),
    banned: kind.ban !== null && actor.banned.includes(kind.ban),
    mono: true,
  };
}

/** The Sender section: the name, the address and how it was given, the
    device and network, then every key a pivot can follow, each with what
    else shares it. Keys the message never carried are left out. */
export function senderRows(message: AdminOwnerMessage, actor: AdminCommentActor): RecordRow[] {
  const signedIn = message.authAtWrite === 'verified';
  const typed = message.authAtWrite === 'anonymous';
  const rows: Array<RecordRow | null> = [
    { id: 'name', label: 'Name', value: message.displayName, pivot: null, count: null, held: null, banned: false, mono: false },
    keyRow(
      actor,
      'email',
      signedIn ? 'Signed-in address' : typed ? 'Typed address' : 'Address',
      signedIn
        ? 'The address of the reader who was signed in when this was sent.'
        : 'Typed into the form. Anybody can type any address, so it does not say who wrote this.',
    ),
    {
      id: 'device',
      label: 'Device',
      value: [actor.browser, actor.os].filter(Boolean).join(' on ') || null,
      pivot: null,
      count: null,
      held: null,
      banned: false,
      mono: false,
    },
    asnRow(actor),
    ...KEY_ORDER.filter((name) => name !== 'email').map((name) => keyRow(actor, name)),
  ];
  return rows.filter((row): row is RecordRow => row !== null);
}
