"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { STATUS_META, type CaseStatus } from "@/lib/domain/case-status";
import { TONE_CHIP } from "./tone";

export function StatusChip({
  status,
  className,
  size = "md",
}: {
  status: CaseStatus;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = STATUS_META[status];
  const tone = TONE_CHIP[meta.tone];
  const pulsing = status === "investigating";
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        tone.chip,
        className,
      )}
      title={meta.description}
    >
      <span className="relative flex size-1.5">
        {pulsing && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", tone.dot)} />}
        <span className={cn("relative size-1.5 rounded-full", tone.dot)} />
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        >
          {meta.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
