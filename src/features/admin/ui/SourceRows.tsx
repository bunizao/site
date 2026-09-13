/* The comment and reaction rows on a source profile, and the ban button that
   sits over them.

   Separate from the profile page itself because the strip and the dialog are
   React and the rest of the profile is static: the numbers above -- the
   spread, the link graph, the hourly shape -- are read, never pressed, and
   shipping them through an island would send a profile's worth of JSON to
   the browser for nothing. */

import * as React from 'react';
import { Button, Card, CardContent } from '@/components/coss';
import { ShieldAlert } from 'lucide-react';
import type {
  AdminBanResult,
  AdminSourceKeyType,
  AdminCommentRecord,
  AdminReactionRecord,
} from '@bunizao/contracts';
import ActorStrip, { sourceBanKey } from './ActorStrip';
import BanDialog from './BanDialog';

function timeAgo(iso: string): string {
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SourceRows({ source, comments, reactions, demo }: {
  source: { type: AdminSourceKeyType; value: string; emailDomainPublishedComments?: number | null };
  demo?: boolean;
  comments: AdminCommentRecord[];
  reactions: AdminReactionRecord[];
}) {
  const [banning, setBanning] = React.useState(false);
  const [receipt, setReceipt] = React.useState<string | null>(null);

  const bannable = sourceBanKey(source.type) !== null;

  return (
    <Card>
      <CardContent className="portal-card-content" style={{ paddingTop: 18 }}>
        {receipt && <p className="portal-comment-receipt"><ShieldAlert size={13} strokeWidth={1.5} />{receipt}</p>}
        {bannable && (
          <div className="portal-source__act">
            <Button size="sm" variant="destructive" onClick={() => setBanning(true)}>
              <ShieldAlert size={14} /> Ban this source…
            </Button>
          </div>
        )}

        {comments.map((comment) => (
          <article className="portal-comment" id={comment.id} key={comment.id}>
            <div className="portal-comment__head">
              <strong className="portal-comment__name">{comment.author}</strong>
              <span className="portal-comment__when">{timeAgo(comment.createdAt)} · {comment.status}</span>
            </div>
            <div className="portal-comment__sub">
              {comment.postSlug ? (
                <a href={`/blog/${comment.postSlug}/`} target="_blank" rel="noreferrer">
                  {comment.postTitle ?? comment.postSlug}
                </a>
              ) : (
                <span className="portal-mono">{comment.postId}</span>
              )}
            </div>
            <p className="portal-comment__body">{comment.body}</p>
            <ActorStrip actor={comment.actor} />
          </article>
        ))}

        {reactions.map((reaction) => (
          <article className="portal-reaction" key={reaction.id}>
            <div className="portal-reaction__head">
              <span className="portal-reaction__emoji" aria-hidden="true">{reaction.emoji}</span>
              <span className="portal-reaction__target">{reaction.postTitle ?? reaction.targetId}</span>
              <span className="portal-reaction__when">{timeAgo(reaction.createdAt)}</span>
            </div>
            <ActorStrip actor={reaction.actor} />
          </article>
        ))}

        {comments.length === 0 && reactions.length === 0 && (
          <div className="portal-list-meta">This key has written nothing in the last 90 days.</div>
        )}
      </CardContent>

      {banning && (
        <BanDialog
          key={`${source.type}:${source.value}`}
          source={source}
          demo={demo}
          onClose={() => setBanning(false)}
          onDone={(result: AdminBanResult) => {
            setBanning(false);
            const purged = result.purged.comments + result.purged.reactions;
            setReceipt(
              `${result.bans.length} key${result.bans.length === 1 ? '' : 's'} banned`
              + (purged > 0 ? `, ${result.purged.comments} comments and ${result.purged.reactions} hearts purged.` : '.'),
            );
          }}
        />
      )}
    </Card>
  );
}
