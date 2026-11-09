import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Kelvin glyph: a six-arm snowflake whose lower arm ends in a thermometer bulb.
 * `tile` renders it white on the indigo→sky gradient (app icon style);
 * `bare` renders the strokes themselves in the gradient.
 */
export function KelvinGlyph({
  className,
  variant = "tile",
}: {
  className?: string;
  variant?: "tile" | "bare";
}) {
  const id = useId();
  const gradId = `kelvin-grad-${id}`;
  const stroke = variant === "tile" ? "#fff" : `url(#${gradId})`;

  // Arms radiate from (16,15). Lower arm is the thermometer stem.
  const arms = [-90, -30, 30, 150, 210];
  const r = 9;
  const c = { x: 16, y: 15 };
  const pt = (deg: number, len: number) => ({
    x: c.x + len * Math.cos((deg * Math.PI) / 180),
    y: c.y + len * Math.sin((deg * Math.PI) / 180),
  });

  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--ai-from)" />
          <stop offset="1" stopColor="var(--ai-to)" />
        </linearGradient>
      </defs>
      {variant === "tile" && <rect width="32" height="32" rx="9" fill={`url(#${gradId})`} />}
      <g stroke={stroke} strokeWidth="1.9" strokeLinecap="round" fill="none">
        {arms.map((deg) => {
          const end = pt(deg, r);
          const mid = pt(deg, r * 0.6);
          // Two short branch ticks per arm, angled outwards
          const tick = (side: 1 | -1) => {
            const a = ((deg + side * 48) * Math.PI) / 180;
            return { x: mid.x + 2.9 * Math.cos(a), y: mid.y + 2.9 * Math.sin(a) };
          };
          const t1 = tick(1);
          const t2 = tick(-1);
          return (
            <g key={deg}>
              <line x1={c.x} y1={c.y} x2={end.x} y2={end.y} />
              <line x1={mid.x} y1={mid.y} x2={t1.x} y2={t1.y} />
              <line x1={mid.x} y1={mid.y} x2={t2.x} y2={t2.y} />
            </g>
          );
        })}
        {/* Thermometer stem (lower arm) */}
        <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + 6.2} />
      </g>
      <circle cx={c.x} cy={c.y + 8.4} r="2.6" fill={stroke} />
    </svg>
  );
}

export function KelvinLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <KelvinGlyph className="size-8" />
      {!compact && (
        <span
          className="text-[1.35rem] leading-none font-semibold tracking-[-0.04em] text-foreground"
          style={{ fontVariationSettings: '"opsz" 32' }}
        >
          kelvin
        </span>
      )}
    </span>
  );
}
