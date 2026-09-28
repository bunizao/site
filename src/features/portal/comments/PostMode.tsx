import type { AdminCommentModeState, CommentSurface } from '@bunizao/contracts';
import type { PortalComment } from '@/features/admin/server/portal-client';
import { isMissingRoute } from '../app/api';
import {
  CACHE_NOTE,
  MODE_CHOICES,
  MODE_LABELS,
  MODE_TONE,
  describeModeError,
  useModeState,
  useSetMode,
  type ModeChoice,
} from '../moderation/modes-data';
import { Segmented, StatusDot } from '../moderation/ui';

/* The comment pane's post line carries the post's comment mode: the same
   four-way override as Post modes, from the same cache entry, so a change
   in either shows in both. What the tags give sits beside it, which with
   Default is what readers get. The line keeps its height from the first frame
   to the answer, so nothing under it moves. */

/** Rows before P2 carry no surface: mood posts key on a numeric id and
    have no slug of their own. */
function surfaceOf(comment: PortalComment): CommentSurface {
  return comment.surface ?? (!comment.postSlug && /^\d+$/.test(comment.postId) ? 'mood' : 'blog');
}

export function PostModeLine({ comment }: { comment: PortalComment }) {
  const surface = surfaceOf(comment);
  const { postId, postTitle: title, postSlug: slug } = comment;
  const one = useModeState(surface, postId, true);
  const set = useSetMode();
  const state: AdminCommentModeState | undefined = one.data;
  const from = surface === 'mood' ? 'Site default' : 'Tags give';

  // Two lines of fixed height, answered or not, so the text below stays put.
  return (
    <div className="min-h-[3.75rem] pt-2 text-[13px]">
      {one.isError ? (
        <p className="flex min-h-7 items-center text-muted-foreground">
          {isMissingRoute(one.error) ? 'Post modes need the updated site-api.' : `Mode not read: ${describeModeError(one.error)}`}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2" title={CACHE_NOTE}>
            <span className="text-muted-foreground">Comments</span>
            <Segmented<ModeChoice | ''>
              label={`Comment mode for ${title ?? postId}`}
              // Nothing is marked until the post's state is read: a guess
              // could make Undo clear an override the post already had.
              value={state ? (state.override ?? 'none') : ''}
              options={[...MODE_CHOICES]}
              onChange={(choice) => {
                if (!state || !choice) return;
                void set({ ...state, title: state.title ?? title, slug: state.slug ?? slug }, choice === 'none' ? null : choice);
              }}
              className="h-7"
            />
          </div>
          <p className="flex min-h-5 items-center gap-1.5 pt-1 text-muted-foreground text-xs">
            {state && (
              <>
                {from}
                {state.tagMode ? <StatusDot tone={MODE_TONE[state.tagMode]}>{MODE_LABELS[state.tagMode]}</StatusDot> : 'nothing: the post was not found'}
                {state.override && <span>· the override wins</span>}
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
