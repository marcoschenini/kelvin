import { Suspense } from "react";
import { Scale } from "lucide-react";
import { Sidebar } from "@/components/shell/sidebar";

const publicDemo = !!process.env.VERCEL || process.env.KELVIN_AUTOSEED === "1";

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
        <p className="mx-auto flex max-w-[1320px] items-start gap-2 px-4 py-4 text-[12px] leading-snug text-muted-foreground sm:px-6 lg:px-10">
          <Scale className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Decision support only. Not legal advice.
            {publicDemo && " Public demo with synthetic data. Cases reset from time to time."}
          </span>
        </p>
      </footer>
    </div>
  );
}
