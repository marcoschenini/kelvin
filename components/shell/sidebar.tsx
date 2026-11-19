"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FilePlus2, FlaskConical, Globe2, Inbox, Menu, MessageSquareText, Settings2, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { KelvinLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { UserMenu } from "./persona-switcher";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  { href: "/live", label: "Live shipments", icon: Globe2, match: (p) => p.startsWith("/live") },
  { href: "/cases", label: "Cases", icon: Inbox, match: (p) => p.startsWith("/cases") && p !== "/cases/new" },
  { href: "/cases/new", label: "New case", icon: FilePlus2, match: (p) => p === "/cases/new" },
  { href: "/ask", label: "Ask Kelvin", icon: MessageSquareText, match: (p) => p.startsWith("/ask") },
  { href: "/eval", label: "Evaluation", icon: FlaskConical, match: (p) => p.startsWith("/eval") },
  // The design system lives under Settings → Appearance (/design is still reachable from there).
  { href: "/settings", label: "Settings", icon: Settings2, match: (p) => p.startsWith("/settings") || p.startsWith("/design") },
];

const focusRing = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Desktop link: text only, the active page is underlined in Kelvin red. */
function TopLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-16 items-center rounded-sm px-3 text-[14px] whitespace-nowrap transition-colors duration-150",
        focusRing,
        active ? "font-semibold text-foreground" : "font-medium text-foreground/70 hover:text-foreground",
      )}
    >
      {item.label}
      {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-sm bg-brand" aria-hidden="true" />}
    </Link>
  );
}

/** Mobile sheet link: icon + label, full width. */
function SheetLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 items-center gap-3 rounded-md pr-3 pl-4 text-[15px] transition-colors",
        focusRing,
        active ? "bg-sidebar-accent font-semibold text-foreground" : "font-medium text-foreground/75 hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-sm bg-brand" aria-hidden="true" />}
      <Icon className={cn("size-4", active ? "text-brand-fg" : "text-subtle")} strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}

/** Horizontal top bar. Below lg the links move into a slide-in menu; the user menu stays in the bar. */
export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Close the mobile menu after navigating.
    setLastPath(pathname);
    setOpen(false);
  }
  return (
    <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-4 sm:px-6 lg:px-10">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("-ml-2 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground lg:hidden", focusRing)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/live" aria-label="Kelvin home" className={cn("shrink-0 rounded-md", focusRing)}>
          <KelvinLogo />
        </Link>
        <nav aria-label="Main" className="hidden h-16 min-w-0 items-center lg:flex">
          {ITEMS.map((item) => (
            <TopLink key={item.href} item={item} active={item.match(pathname)} />
          ))}
        </nav>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[280px] gap-0 bg-sidebar p-0 lg:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-16 items-center border-b border-sidebar-border px-5">
            <KelvinLogo />
          </div>
          <nav aria-label="Main" className="flex flex-col gap-0.5 p-3">
            {ITEMS.map((item) => (
              <SheetLink key={item.href} item={item} active={item.match(pathname)} />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
