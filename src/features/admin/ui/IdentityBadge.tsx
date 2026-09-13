import type { AdminCommentActor } from '@bunizao/contracts';
import { Badge } from '@/components/coss';

export type IdentityStatus = 'verified' | 'claimed' | 'anonymous' | 'unknown';

export const IDENTITY_LABELS: Record<IdentityStatus, string> = {
  verified: 'Verified when written',
  claimed: 'Claimed later',
  anonymous: 'Anonymous when written',
  unknown: 'Verification unknown',
};

export function identityStatus(actor: AdminCommentActor): IdentityStatus {
  if (actor.authAtWrite === 'verified') return 'verified';
  if (actor.readerId && actor.claimedAt) return 'claimed';
  return actor.authAtWrite === 'anonymous' ? 'anonymous' : 'unknown';
}

export default function IdentityBadge({ actor }: { actor: AdminCommentActor }) {
  const status = identityStatus(actor);
  return (
    <Badge variant={status === 'verified' ? 'success' : 'secondary'} size="sm"
      data-identity={status}
      title={status === 'verified'
        ? 'An authenticated reader session was verified when this was written. This is not a current account-status check.'
        : status === 'claimed'
          ? 'Linked to a reader after writing. The original authentication evidence is unchanged.'
          : status === 'anonymous'
            ? 'No verified reader session at writing. This does not mean the person is suspicious.'
            : 'No reliable authentication evidence was recorded. A reader ID or passed challenge alone is not proof.'}>
      {IDENTITY_LABELS[status]}
    </Badge>
  );
}
