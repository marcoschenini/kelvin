import { Suspense } from "react";
import { Sidebar } from "@/components/shell/sidebar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Suspense fallback={<div className="h-14 shrink-0 border-b border-sidebar-border bg-sidebar lg:h-auto lg:w-[248px] lg:border-r lg:border-b-0" />}>
        <Sidebar publicDemo={!!process.env.VERCEL || process.env.KELVIN_AUTOSEED === "1"} />
      </Suspense>
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
