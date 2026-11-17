import { cn } from "@/lib/utils";

/**
 * Kelvin mark: a thermometer pictogram (stem and bulb) cut out of a small red tile.
 * `tile` renders the white pictogram on the brand red; `bare` renders the pictogram itself in red.
 */
export function KelvinGlyph({ className, variant = "tile" }: { className?: string; variant?: "tile" | "bare" }) {
  const ink = variant === "tile" ? "var(--primary-foreground)" : "var(--brand)";
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} aria-hidden="true">
      {variant === "tile" && <rect width="24" height="24" rx="4" fill="var(--brand)" />}
      {/* stem with two graduation ticks, then the bulb */}
      <g stroke={ink} strokeLinecap="round" fill="none">
        <line x1="12" y1="5" x2="12" y2="14" strokeWidth="2.2" />
        <line x1="14.6" y1="7.4" x2="16.4" y2="7.4" strokeWidth="1.4" />
        <line x1="14.6" y1="10.4" x2="16.4" y2="10.4" strokeWidth="1.4" />
      </g>
      <circle cx="12" cy="16.9" r="3.1" fill={ink} />
    </svg>
  );
}

/** Wordmark: "Kelvin" set in the serif next to the red mark, with an optional descriptor underneath. */
export function KelvinLogo({
  className,
  compact = false,
  descriptor = "Claims Recovery",
}: {
  className?: string;
  compact?: boolean;
  descriptor?: string | null;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <KelvinGlyph className="size-7" />
      {!compact && (
        <span className="flex flex-col">
          <span className="font-heading text-[1.4rem] leading-none font-semibold tracking-[-0.015em] text-foreground">Kelvin</span>
          {descriptor && <span className="mt-1 text-[9.5px] leading-none font-semibold tracking-[0.14em] text-muted-foreground uppercase">{descriptor}</span>}
        </span>
      )}
    </span>
  );
}
