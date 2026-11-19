import { Suspense } from "react";
import Link from "next/link";
import { KelvinGlyph } from "@/components/brand/logo";
import { Sidebar } from "@/components/shell/sidebar";
import { CLIENT } from "@/lib/live/fleet";

const FOOTER_LINKS = [
  ["/live", "Live shipments"],
  ["/cases", "Cases"],
  ["/ask", "Ask Kelvin"],
  ["/settings", "Settings"],
] as const;

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Background with depth on every page: fixed, decorative (see .kelvin-backdrop in globals.css) */}
      <div aria-hidden="true" className="kelvin-backdrop">
        <div className="kelvin-clouds" />
      </div>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Suspense fallback={<div className="h-16 shrink-0 border-b border-sidebar-border bg-sidebar" />}>
        <Sidebar />
      </Suspense>
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5 text-[13px] text-muted-foreground sm:px-6 lg:px-10">
          <span className="flex items-center gap-2.5">
            <KelvinGlyph variant="bare" className="size-6" />
            <span>
              Kelvin · Cold-chain claims recovery for <span className="font-medium text-foreground">{CLIENT}</span>
            </span>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
            {FOOTER_LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
