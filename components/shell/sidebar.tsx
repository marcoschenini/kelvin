"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus2, FlaskConical, Inbox, Palette, Scale, Settings2, type LucideIcon } from "lucide-react";
import { KelvinLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { PersonaSwitcher } from "./persona-switcher";
import { ThemeToggle } from "./theme";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  shortcut?: string;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Cases", icon: Inbox, match: (p) => p === "/" || (p.startsWith("/cases") && p !== "/cases/new") },
  { href: "/cases/new", label: "New case", icon: FilePlus2, match: (p) => p === "/cases/new" },
  { href: "/eval", label: "Evaluation", icon: FlaskConical, match: (p) => p.startsWith("/eval") },
];

const SECONDARY: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings2, match: (p) => p.startsWith("/settings") },
  { href: "/design", label: "Design system", icon: Palette, match: (p) => p.startsWith("/design") },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
    >
      {active && <span className="bg-ai absolute top-2 bottom-2 left-0 w-[3px] rounded-full" aria-hidden="true" />}
      <Icon className={cn("size-4", active ? "text-ai-fg" : "text-subtle group-hover:text-foreground")} />
      {item.label}
    </Link>
  );
}

export function Sidebar({ publicDemo = false }: { publicDemo?: boolean }) {
  const pathname = usePathname() ?? "/";
  return (
    <aside className="sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Kelvin home" className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <KelvinLogo />
        </Link>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-6 px-3 pt-2">
        <div className="flex flex-col gap-0.5">
          {PRIMARY.map((item) => (
            <NavLink key={item.href} item={item} active={item.match(pathname)} />
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow px-3 pb-1.5 text-subtle">Workspace</span>
          {SECONDARY.map((item) => (
            <NavLink key={item.href} item={item} active={item.match(pathname)} />
          ))}
        </div>
      </nav>

      <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
        <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          <Scale className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Decision support only. Not legal advice.
            {publicDemo && <span className="mt-1 block">Public demo with synthetic data. Cases reset from time to time.</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <PersonaSwitcher />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
