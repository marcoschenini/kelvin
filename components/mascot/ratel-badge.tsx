"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { RatelFigure } from "./ratel-figure";
import { ARMS, BODY_ANIMS, PART_ANIMS, type RatelState } from "./ratel-states";

/**
 * Ratel, Kelvin's mascot (the honey badger from our earlier project, reused as is):
 * cream engraving lines on a navy badge, so it reads the same in light and dark themes.
 *
 *  avatar  round badge with head and shoulders (headers, buttons)
 *  full    the whole ratel standing on a rounded navy card (empty states)
 *
 * State "think" while Kelvin is answering (paw on chin), "idle" otherwise. Still for
 * people who prefer reduced motion. Decorative: aria-hidden, the text around it speaks.
 */
export function RatelBadge({
  size = 40,
  state = "idle",
  variant = "avatar",
  className,
}: {
  /** avatar: diameter in px; full: figure height in px */
  size?: number;
  state?: RatelState;
  variant?: "avatar" | "full";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const anims = reduced ? undefined : PART_ANIMS[state];
  const arms = reduced ? "crossed" : ARMS[state];

  if (variant === "full") {
    const body = BODY_ANIMS[state];
    return (
      <div aria-hidden="true" className={cn("inline-flex items-end justify-center rounded-2xl bg-mascot px-6 pt-5 pb-3", className)}>
        <motion.div animate={reduced ? undefined : body.animate} transition={body.transition}>
          <RatelFigure height={size} anims={anims} arms={arms} eyesClosed={!reduced && state === "sleep"} />
        </motion.div>
      </div>
    );
  }

  // Head and shoulders: the figure (viewBox 240×340) drawn 1.6× the badge, head centred.
  const h = size * 1.6;
  const k = h / 340;
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full bg-mascot ring-1 ring-mascot/20", className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute" style={{ left: size * 0.5 - 145 * k, top: size * 0.44 - 66 * k }}>
        <RatelFigure height={h} anims={anims} arms={arms} />
      </span>
    </span>
  );
}
