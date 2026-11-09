import { cn } from "@/lib/utils";
import { ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { ROUTE_ICON } from "./party-icons";

/** "Insurer" with its icon; `recommended` adds the AI gradient ring. */
export function RouteChip({
  route,
  recommended,
  className,
}: {
  route: RecoveryRoute | null;
  recommended?: boolean;
  className?: string;
}) {
  if (!route) return <span className={cn("text-xs text-subtle", className)}>—</span>;
  const meta = ROUTE_META[route];
  const Icon = ROUTE_ICON[route];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
        recommended ? "border-ai text-ai-fg" : "border border-border bg-card text-foreground/80",
        className,
      )}
      title={meta.long}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
