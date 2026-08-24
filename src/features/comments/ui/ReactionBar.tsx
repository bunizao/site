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
import { initials, seedHue } from '@/features/comments/identity';
import type { Reactor } from '@/features/comments/types';

interface Props {
  count: number;
  reacted?: boolean;
  signedIn?: boolean;
  reactors?: Reactor[];
  faceLimit?: number;
}

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

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
  signedIn = false,
  reactors = [],
  faceLimit = 5,
}: Props) {
  const stack = React.useRef<HTMLDivElement>(null);
  const scope = React.useRef<HTMLDivElement>(null);
  const [liked, setLiked] = React.useState(reacted);
  const [flipped, setFlipped] = React.useState(false);
  const [sparks, setSparks] = React.useState<Spark[]>([]);
  const sparkId = React.useRef(0);

  const total = count + (liked && !reacted ? 1 : 0) - (!liked && reacted ? 1 : 0);
  const faces = reactors.slice(0, faceLimit);
  const overflow = Math.max(0, total - faces.length);

  React.useEffect(() => {
    if (!stack.current) return;
    return mountAvatarComb(stack.current);
  }, [faces.length, overflow]);

  // Turning the pill back over is a dismissal, so it answers to the two things
  // every dismissal answers to.
  React.useEffect(() => {
    if (!flipped) return;
    const away = (event: MouseEvent) => {
      if (!scope.current?.contains(event.target as Node)) setFlipped(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFlipped(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [flipped]);

  function toggle() {
    // Signed out the pill is not inert — pressing it turns the card over and
    // offers the way in. Hover would strand every touch device.
    if (!signedIn) {
      setFlipped(true);
      return;
    }
    const next = !liked;
    setLiked(next);
    if (!next) return;

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

  return (
    <div ref={scope} className="blog-react" data-pagefind-ignore>
      {/* Signed out, pressing the pill turns it over and offers the way in, so
          the bar never has to carry a line of "sign in to react" copy beside
          it. Both faces share a min-width, which is what keeps the flip from
          resizing the row mid-turn. */}
      <div className={cn('blog-react__flip', flipped && 'is-flipped')}>
        <div className="blog-react__faces">
          <div className="blog-react__face-front">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={signedIn ? liked : undefined}
              aria-label={
                signedIn ? (liked ? 'Remove your reaction' : 'Like this post') : 'Sign in to react'
              }
              tabIndex={flipped ? -1 : 0}
              className={cn('blog-react__pill', liked && 'is-liked')}
            >
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
              <svg
                viewBox="0 0 24 24"
                fill={liked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.5"
                className="blog-react__glyph"
                aria-hidden="true"
              >
                <path d={HEART_PATH} />
              </svg>
              {/* Slot-machine roller: both values are always mounted and the
                  column slides, so the digits travel instead of blinking. */}
              <span className="blog-react__roller">
                <span
                  className="blog-react__reel"
                  style={{ transform: `translateY(${liked === reacted ? '0' : '-1.5em'})` }}
                >
                  <span>{count}</span>
                  <span>{total}</span>
                </span>
              </span>
            </button>
          </div>

          <div className="blog-react__face-back">
            <button type="button" className="blog-react__signin" tabIndex={flipped ? 0 : -1}>
              {/* A door, not a provider mark: this face opens the choice
                  between three ways in, and stamping one vendor's logo on it
                  promises a path the button does not take. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
              </svg>
              Sign in
            </button>
          </div>
        </div>
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
