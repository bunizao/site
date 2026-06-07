import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type TargetAndTransition } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ProjectCardItem {
  id: string;
  content: ReactNode;
  label?: string;
}

interface ProjectCardStackProps {
  cards: ProjectCardItem[];
  className?: string;
  intervalMs?: number;
}

const entranceMs = 1200;
const visibleDepth = 4;

const depthRotations = [0, -4.8, 4.2, -3.2, 2.2];

function getStackPose(depth: number): TargetAndTransition {
  const layer = Math.min(depth, visibleDepth);
  const side = layer % 2 === 0 ? -1 : 1;

  return {
    x: side * layer * 10,
    y: layer * 34,
    z: -layer * 92,
    scale: 1 - layer * 0.055,
    rotateX: layer * 3.5,
    rotateZ: depthRotations[layer],
    opacity: depth > visibleDepth ? 0 : 1 - layer * 0.12,
    filter: `blur(${Math.max(0, layer - 2) * 0.35}px)`,
  };
}

function getEntrancePose(depth: number): TargetAndTransition {
  const layer = Math.min(depth, visibleDepth);

  return {
    x: 0,
    y: 42 + layer * 4,
    z: -layer * 18,
    scale: 0.82 - layer * 0.012,
    rotateX: 0,
    rotateZ: layer % 2 === 0 ? 1.2 : -1.2,
    opacity: 0,
    filter: "blur(8px)",
  };
}

export function ProjectCardStack({
  cards,
  className,
  intervalMs = 3600,
}: ProjectCardStackProps) {
  const prefersReducedMotion = useReducedMotion();
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const [order, setOrder] = useState(cardIds);
  const [hasEntered, setHasEntered] = useState(Boolean(prefersReducedMotion));
  const loopTimeoutRef = useRef<number | null>(null);

  const cardsById = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );

  useEffect(() => {
    setOrder(cardIds);
  }, [cardIds]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setHasEntered(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setHasEntered(true);
    }, entranceMs);

    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (loopTimeoutRef.current !== null) {
      window.clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }

    if (!hasEntered || prefersReducedMotion || cards.length < 2) return;

    const scheduleNextTurn = () => {
      loopTimeoutRef.current = window.setTimeout(() => {
        setOrder((currentOrder) => {
          if (currentOrder.length < 2) return currentOrder;
          return [...currentOrder.slice(1), currentOrder[0]];
        });
        scheduleNextTurn();
      }, intervalMs);
    };

    scheduleNextTurn();

    return () => {
      if (loopTimeoutRef.current !== null) {
        window.clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
    };
  }, [cards.length, hasEntered, intervalMs, prefersReducedMotion]);

  const orderedCards = order
    .map((id) => cardsById.get(id))
    .filter((card): card is ProjectCardItem => Boolean(card));

  return (
    <div
      className={cn(
        "relative mx-auto h-[560px] w-full max-w-[690px] sm:h-[590px] lg:h-[610px]",
        className,
      )}
      aria-label="Project card stack"
    >
      <div
        className="absolute inset-x-8 top-24 h-[360px] rounded-[8px] bg-black/[0.12] blur-3xl dark:bg-white/10"
        aria-hidden="true"
      />
      <div
        className="relative h-full w-full"
        style={{
          perspective: 1200,
          transformStyle: "preserve-3d",
        }}
      >
        {orderedCards.map((card, depth) => {
          const active = depth === 0;

          return (
            <motion.article
              key={card.id}
              className="absolute left-0 right-0 top-0 mx-auto w-full max-w-[640px] outline-none"
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: "center top",
                zIndex: cards.length - depth,
                pointerEvents: active ? "auto" : "none",
              }}
              initial={prefersReducedMotion ? getStackPose(depth) : getEntrancePose(depth)}
              animate={getStackPose(depth)}
              transition={{
                type: "spring",
                stiffness: hasEntered ? 120 : 96,
                damping: hasEntered ? 20 : 24,
                mass: hasEntered ? 0.82 : 0.9,
                delay: hasEntered || prefersReducedMotion ? 0 : depth * 0.09,
              }}
              aria-label={card.label}
              aria-hidden={!active}
              inert={!active ? true : undefined}
              data-depth={depth}
              data-active={active ? "true" : "false"}
            >
              {card.content}
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
