import * as React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { mountAvatarComb } from '@/features/comments/client/use-avatar-comb';
import { mountMagnetic } from '@/features/comments/client/use-magnetic';
import { getTurnstileToken, releaseTurnstileToken } from '@/features/comments/client/turnstile-token';
import { initials, seedHue } from '@/features/comments/identity';
import { resolveCommentsCopy } from '@/features/comments/copy';
import type { Reactor } from '@/features/comments/types';

interface Props {
  count: number;
  reacted?: boolean;
  reactors?: Reactor[];
  faceLimit?: number;
  /** Page locale. The island renders before any DOM exists to read it from. */
  locale?: string;
  /** Ghost post.id. When set, the bar loads its live tally from
      /api/v2/reactions on mount and persists presses through
      /api/v2/reactions/toggle; without it (lab page) presses stay local. */
  postId?: string;
  /** Turnstile site key for the invisible 'blog_reaction' widget. */
  siteKey?: string;
}

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function Heart({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      className="blog-react__glyph"
      aria-hidden="true"
    >
      <path d={HEART_PATH} />
    </svg>
  );
}

/** One burst of hearts per like. Keyed by id so a fast double-tap stacks. */
interface Spark {
  id: number;
  x: number;
  rot: number;
  delay: number;
}

export default function ReactionBar({
  count,
  reacted = false,
  reactors = [],
  faceLimit = 5,
  locale,
  postId,
  siteKey = '',
}: Props) {
  const t = resolveCommentsCopy(locale);
  const stack = React.useRef<HTMLDivElement>(null);
  const scope = React.useRef<HTMLDivElement>(null);
  const [summary, setSummary] = React.useState({ count, reacted, reactors });
  const [liked, setLiked] = React.useState(reacted);
  const [sparks, setSparks] = React.useState<Spark[]>([]);
  const sparkId = React.useRef(0);
  const inflight = React.useRef(false);

  // /blog/[slug] is prerendered, so the island always ships with a zero
  // tally and asks for the live one on mount.
  React.useEffect(() => {
    if (!postId) return;
    const key = `post:${postId}`;
    let cancelled = false;
    fetch(`/api/v2/reactions?targets=${encodeURIComponent(key)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const live = json?.reactions?.[key]?.[0];
        if (cancelled || !live) return;
        setSummary({
          count: live.count,
          reacted: live.reacted,
          reactors: (live.reactors ?? []).map(
            (chip: { name: string; avatarUrl: string | null }): Reactor => ({
              name: chip.name,
              avatar: chip.avatarUrl ?? undefined,
            }),
          ),
        });
        setLiked(live.reacted);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // The two faces of the card are the two counts, so each is derived once here
  // rather than animated from one into the other: `base` is the tally without
  // this reader, `mine` the same tally with them in it.
  const base = summary.reacted ? summary.count - 1 : summary.count;
  const mine = base + 1;
  const total = liked ? mine : base;
  const faces = summary.reactors.slice(0, faceLimit);
  const overflow = Math.max(0, total - faces.length);

  React.useEffect(() => {
    if (!stack.current) return;
    return mountAvatarComb(stack.current);
  }, [faces.length, overflow]);

  // The pull rides the whole bar, not the pill, so the card starts drifting
  // before the cursor is over anything to press. It targets the flip wrapper —
  // see use-magnetic for why it cannot be the faces.
  React.useEffect(() => {
    if (!scope.current) return;
    return mountMagnetic(scope.current, { radius: 110, strength: 0.45, lift: -8, scale: 1.12 });
  }, []);

  function spawnSparks() {
    const burst = Array.from({ length: 5 }, (_, i) => ({
      id: sparkId.current++,
      x: (i - 2) * 7 + (i % 2 ? 3 : -3),
      rot: (i - 2) * 14,
      delay: i * 45,
    }));
    setSparks((current) => [...current, ...burst]);
    window.setTimeout(
      () => setSparks((current) => current.filter((s) => !burst.some((b) => b.id === s.id))),
      1100,
    );
  }

  async function toggle() {
    // One request at a time: a press mid-flight would race the reconcile
    // below, and a heart is not worth a queue.
    if (inflight.current) return;
    const next = !liked;
    setLiked(next);
    if (next) spawnSparks();
    if (!postId) return;

    inflight.current = true;
    try {
      const turnstileToken = await getTurnstileToken(siteKey, 'blog_reaction');
      const response = await fetch('/api/v2/reactions/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: postId, reacted: next, turnstileToken }),
      });
      releaseTurnstileToken('blog_reaction');
      if (!response.ok) throw new Error(String(response.status));
      const json = await response.json();
      const live = json?.reaction;
      if (live && typeof live.count === 'number') {
        setSummary((current) => ({ ...current, count: live.count, reacted: live.reacted }));
        setLiked(Boolean(live.reacted));
      }
    } catch {
      setLiked(!next);
    } finally {
      inflight.current = false;
    }
  }

  return (
    <div ref={scope} className="blog-react" data-pagefind-ignore>
      {/* Liking a post asks for no account. It is a count, not a signature: the
          card used to turn over to a Sign in door on the first press, which
          charged a reader an identity for one bit of feedback. It still turns
          over -- that was the good part -- but the far side is now the liked
          state itself, so the flip IS the feedback rather than a toll gate.
          Anonymous presses are counted; they just put no face in the stack,
          because the site has no name to put there. */}
      <div className="blog-react__pull" data-magnetic>
        {/* Outside the card, so the burst happens in flat screen space over a
            face that is mid-rotation. */}
        <span className="blog-react__sparks" aria-hidden="true">
          {sparks.map((spark) => (
            <svg
              key={spark.id}
              viewBox="0 0 24 24"
              fill="currentColor"
              className="blog-react__spark"
              style={{
                ['--spark-x' as string]: `${spark.x}px`,
                ['--spark-rot' as string]: `${spark.rot}deg`,
                animationDelay: `${spark.delay}ms`,
              }}
            >
              <path d={HEART_PATH} />
            </svg>
          ))}
        </span>

        <button
          type="button"
          onClick={toggle}
          aria-pressed={liked}
          aria-label={liked ? t.reactRemove : t.reactAdd}
          className={cn('blog-react__card', liked && 'is-flipped')}
        >
          {/* Both faces are always mounted and stacked in one grid cell, which
              is also what keeps them the same width when the two counts have a
              different number of digits. */}
          <span className="blog-react__pill" aria-hidden={liked}>
            <Heart />
            <span className="blog-react__count">{base}</span>
          </span>
          <span className="blog-react__pill blog-react__pill--liked" aria-hidden={!liked}>
            <Heart filled />
            <span className="blog-react__count">{mine}</span>
          </span>
        </button>
      </div>

      {faces.length > 0 && (
        /* Tighter than the component default: the faces have to read as one
           overlapping stack, not a row that happens to touch. Paint order runs
           left to right via an explicit z-index, so each face clips the one
           before it.

           No heart badge on each face. Every face in this stack reacted — that
           is what the stack IS — so a heart on all five says nothing the row
           does not already say, and the overlap clips each one to a crescent
           with its glyph hidden underneath the next circle. It read as a
           rendering fault, which is an expensive way to repeat yourself. */
        <AvatarGroup ref={stack} className="blog-react__stack -space-x-[9px]">
          {faces.map((reactor, i) => (
            <Avatar
              key={reactor.name}
              size="default"
              data-comb-item
              className="blog-react__avatar"
              style={{
                zIndex: i,
                ['--entry-delay' as string]: `${i * 60}ms`,
                ['--seed-hue' as string]: seedHue(reactor.name),
              }}
            >
              {reactor.avatar && <AvatarImage src={reactor.avatar} alt={reactor.name} />}
              <AvatarFallback className="blog-avatar-seed blog-avatar-initials">
                {initials(reactor.name)}
              </AvatarFallback>
              {/* Hover names the face instead of pulling it clear of the stack:
                  the overlap is the point, and a face that jumps to the front
                  reshuffles the row every time the pointer crosses it. Hidden
                  from assistive tech — the image alt already carries the name.
                  Sits below the circles, so it is never clipped by the next
                  face's stacking context. */}
              <span className="blog-react__name" aria-hidden="true">
                {reactor.name}
              </span>
            </Avatar>
          ))}
          {overflow > 0 && (
            <AvatarGroupCount
              data-comb-item
              className="blog-react__avatar blog-react__more"
              style={{ zIndex: faces.length, ['--entry-delay' as string]: `${faces.length * 60}ms` }}
            >
              +{overflow}
            </AvatarGroupCount>
          )}
        </AvatarGroup>
      )}
    </div>
  );
}
