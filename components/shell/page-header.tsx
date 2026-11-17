import { cn } from "@/lib/utils";

/**
 * Page title block: overline, serif title, one-line description, actions on the right,
 * closed by a hairline rule.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border pb-6", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-2">{typeof eyebrow === "string" ? <span className="eyebrow text-muted-foreground">{eyebrow}</span> : eyebrow}</div>}
        <h1 className="text-[1.875rem] leading-[1.1] font-semibold tracking-[-0.015em] text-foreground sm:text-[2.125rem]">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standard page container: generous whitespace on a 12-column rhythm, comfortable at 1280px and on a projector. */
export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10", className)}>{children}</div>;
}
