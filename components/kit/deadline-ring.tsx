"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { deadlineTone } from "./deadline-pill";

const TONE_STROKE = {
  danger: "var(--danger)",
  warning: "var(--warning)",
} as const;

/**
 * Circular countdown to the nearest deadline. The arc shows how much of the
 * notice window is left (e.g. 5 of 14 days), and fills in on mount.
 */
export function DeadlineRing({
  daysLeft,
  windowDays,
  label,
  size = 96,
  className,
}: {
  daysLeft: number | null;
  /** Total length of the notice window, e.g. 14 for Montreal Art. 31 */
  windowDays: number;
  label?: string;
  size?: number;
  className?: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const tone = deadlineTone(daysLeft);
  const fraction = daysLeft == null ? 0 : Math.max(0, Math.min(1, daysLeft / windowDays));
  const color = tone === "danger" || tone === "warning" ? TONE_STROKE[tone] : `url(#ring-${id})`;
  const overdue = daysLeft != null && daysLeft < 0;

  return (
    <div
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        daysLeft == null ? "No open deadline" : `${daysLeft} days left${label ? ` until ${label}` : ""}`
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ai-from)" />
            <stop offset="1" stopColor="var(--ai-to)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={overdue ? "var(--danger)" : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: reduce ? circ * (1 - fraction) : circ }}
          animate={{ strokeDashoffset: overdue ? 0 : circ * (1 - fraction) }}
          transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span
          className={cn(
            "num leading-none font-semibold tracking-tight",
            size >= 88 ? "text-[1.75rem]" : "text-xl",
            tone === "danger" ? "text-danger-fg" : tone === "warning" ? "text-warning-fg" : "text-foreground",
          )}
        >
          {daysLeft == null ? "–" : Math.abs(daysLeft)}
        </span>
        <span className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {daysLeft == null
            ? "no deadline"
            : overdue
              ? daysLeft === -1
                ? "day over"
                : "days over"
              : daysLeft === 1
                ? "day left"
                : "days left"}
        </span>
      </div>
    </div>
  );
}
