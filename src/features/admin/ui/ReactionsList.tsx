/* The reactions list: hearts, read for where they came from.

   A comment carries a body, so the queue can be read without ever looking at
   an actor block. A heart carries nothing -- it is one bit, and the only
   question worth asking about it is who pressed it and how many times their
   subnet did. So every row here is an actor strip with a target above it,
   and there is no verdict to make: reactions are not moderated, only banned
   sources are made not to count. */

import * as React from 'react';
import { Card, CardContent } from '@/components/coss';
import { Heart, Inbox } from 'lucide-react';
import type { AdminBanResult, AdminCommentActor, AdminReactionRecord } from '@bunizao/contracts';
import ActorStrip from './ActorStrip';
import BanDialog from './BanDialog';

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function ReactionsList({ reactions }: { reactions: AdminReactionRecord[] }) {
  const [banning, setBanning] = React.useState<AdminCommentActor | null>(null);
  const [receipt, setReceipt] = React.useState<string | null>(null);

  if (reactions.length === 0) {
    return (
      <Card>
        <CardContent className="portal-card-content">
          <div className="portal-empty">
            <span className="portal-empty-icon"><Inbox size={18} strokeWidth={1.5} /></span>
            <p className="portal-empty-title">No reactions in this view</p>
            <p className="portal-empty-hint">Hearts land here as they are pressed.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="portal-card-content" style={{ paddingTop: 18 }}>
        {receipt && <p className="portal-comment-receipt"><Heart size={13} strokeWidth={1.5} />{receipt}</p>}
        {reactions.map((reaction) => (
          <article className="portal-reaction" key={reaction.id}>
            <div className="portal-reaction__head">
              <span className="portal-reaction__emoji" aria-hidden="true">{reaction.emoji}</span>
              <span className="portal-reaction__target">
                {reaction.targetType === 'comment' ? 'on a comment in ' : 'on '}
                {reaction.postSlug ? (
                  <a href={`/blog/${reaction.postSlug}/`} target="_blank" rel="noreferrer">
                    {reaction.postTitle ?? reaction.postSlug}
                  </a>
                ) : (
                  <span className="portal-mono">{reaction.targetId}</span>
                )}
              </span>
              <span className="portal-reaction__when">{timeAgo(reaction.createdAt)}</span>
            </div>
            <ActorStrip actor={reaction.actor} onBan={setBanning} />
          </article>
        ))}
      </CardContent>
      {banning && (
        <BanDialog
          actor={banning}
          onClose={() => setBanning(null)}
          onDone={(result: AdminBanResult) => {
            setBanning(null);
            setReceipt(
              `${result.bans.length} key${result.bans.length === 1 ? '' : 's'} banned. `
              + 'Their hearts will answer normally and move no count.',
            );
          }}
        />
      )}
    </Card>
  );
}
