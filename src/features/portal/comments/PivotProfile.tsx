import * as React from 'react';
import type { AdminSourceKeyType, AdminSourceProfile, MessageState } from '@bunizao/contracts';
import { shortHandle, stamp } from './model';
import { PivotAnchor, PortalLink } from './RecordRows';

/* What a pivot key reached beyond its comments: the addresses given under
   it, the devices it was seen on and the messages sent with it. Quiet on
   purpose: a label, then one item a line, the value in the text colour and
   the counts muted. An address a signed-in reader wrote with says "signed
   in"; any other says "typed", and is never named as that reader. */

/** Newest first. The rest of the rows the profile carries (at most 50)
    open in place, so none is out of reach. */
const MESSAGE_ROWS = 3;

const STATE_ORDER: MessageState[] = ['new', 'read', 'replied', 'archived', 'spam'];

function plural(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? '' : 's'}`;
}

function counts(parts: Array<[number, string]>): string {
  return parts.filter(([count]) => count > 0).map(([count, one]) => plural(count, one)).join(' · ');
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
      <dt className="py-1 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-col">{children}</dd>
    </div>
  );
}

function Item({ children, meta }: { children: React.ReactNode; meta: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-3 py-1">
      <span className="min-w-0 truncate">{children}</span>
      {meta && <span className="shrink-0 text-muted-foreground text-xs tabular-nums">{meta}</span>}
    </span>
  );
}

export function PivotProfile({ pivot, profile }: {
  pivot: { key: AdminSourceKeyType; value: string };
  profile: AdminSourceProfile;
}) {
  // The key's own value adds nothing to its own list.
  const addresses = (profile.addresses ?? []).filter((entry) => !(pivot.key === 'email' && entry.emailHash === pivot.value));
  const devices = (profile.devices ?? []).filter((entry) => !(pivot.key === 'client_fp' && entry.clientFp === pivot.value));
  const messages = profile.messages && profile.messages.total > 0 ? profile.messages : null;
  const [allMessages, setAllMessages] = React.useState(false);
  if (addresses.length === 0 && devices.length === 0 && !messages) return null;

  return (
    <dl aria-label="Also under this key" className="flex flex-col gap-1 px-4 pb-2.5 text-[13px] leading-5">
      {addresses.length > 0 && (
        <Line label="Addresses">
          {addresses.map((entry) => (
            <Item
              key={entry.emailHash}
              meta={[entry.confirmed ? 'signed in' : 'typed', counts([[entry.comments, 'comment'], [entry.messages, 'message']])].filter(Boolean).join(' · ')}
            >
              <PivotAnchor pivot={{ type: 'email', value: entry.emailHash }} keep={null}>
                {entry.email ?? shortHandle(entry.emailHash)}
              </PivotAnchor>
            </Item>
          ))}
        </Line>
      )}
      {devices.length > 0 && (
        <Line label="Devices">
          {devices.map((entry) => (
            <Item
              key={entry.clientFp}
              meta={counts([[entry.comments, 'comment'], [entry.reactions, 'reaction'], [entry.messages, 'message']])}
            >
              <PivotAnchor pivot={{ type: 'client_fp', value: entry.clientFp }} keep={null}>
                {[entry.browser, entry.os].filter(Boolean).join(' on ') || shortHandle(entry.clientFp)}
              </PivotAnchor>
            </Item>
          ))}
        </Line>
      )}
      {messages && (
        <Line label="Messages">
          <span className="py-1 text-muted-foreground">
            {messages.total}: {STATE_ORDER.filter((state) => messages.byState[state] > 0).map((state) => `${messages.byState[state]} ${state}`).join(', ')}
          </span>
          {messages.rows.slice(0, allMessages ? undefined : MESSAGE_ROWS).map((message) => (
            <Item key={message.id} meta={stamp(message.createdAt)}>
              {/* A sentence underlined end to end reads as a wall; the
                  underline comes on pointing, like the feed's titles. */}
              <PortalLink to={`/messages?m=${encodeURIComponent(message.id)}`} className="no-underline hover:underline">
                {message.displayName}: {message.body.split('\n')[0]}
              </PortalLink>
            </Item>
          ))}
          {!allMessages && messages.rows.length > MESSAGE_ROWS && (
            <button
              type="button"
              className="self-start rounded-sm py-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setAllMessages(true)}
            >
              Show {messages.rows.length - MESSAGE_ROWS} more
            </button>
          )}
        </Line>
      )}
    </dl>
  );
}
