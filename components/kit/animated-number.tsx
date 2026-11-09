"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { formatEUR, formatNumber } from "@/lib/format";

/**
 * Counts up to `value` once it scrolls into view. Renders the final value on the
 * server so there is no layout shift and no flash of "0" without JS.
 */
export function AnimatedNumber({
  value,
  format = "number",
  className,
  duration = 0.65,
}: {
  value: number;
  format?: "number" | "eur";
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const fmt = format === "eur" ? formatEUR : (n: number) => formatNumber(n);
  const prev = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = fmt(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.2, 0, 0, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduce, duration, format]);

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {fmt(value)}
    </span>
  );
}
