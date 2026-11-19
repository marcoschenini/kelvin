"use client";

import { Check, ChevronDown, Moon, Scale, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_PERSONA_ID, PERSONA_COOKIE, PERSONAS, getPersona, type Persona } from "@/lib/domain/personas";
import { cn } from "@/lib/utils";

const ROLE_STYLE: Record<Persona["role"], string> = {
  qa: "bg-card text-human-fg ring-1 ring-human/40 ring-inset",
  manager: "bg-ai text-white dark:text-background",
  analyst: "bg-muted text-muted-foreground ring-1 ring-border ring-inset",
};

function readCookie(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${PERSONA_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : DEFAULT_PERSONA_ID;
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function setPersonaCookie(id: string) {
  document.cookie = `${PERSONA_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

export function usePersona(): Persona {
  const id = useSyncExternalStore(subscribe, readCookie, () => DEFAULT_PERSONA_ID);
  return getPersona(id);
}

export function PersonaAvatar({ persona, className }: { persona: Persona; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
        ROLE_STYLE[persona.role],
        className,
      )}
      aria-hidden="true"
    >
      {persona.initials}
    </span>
  );
}

/** Top-bar user menu: who you are acting as, persona switch, theme and the legal note. */
export function UserMenu({ publicDemo = false }: { publicDemo?: boolean }) {
  const persona = usePersona();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Acting as ${persona.name}, ${persona.title}. Open user menu`}
      >
        <PersonaAvatar persona={persona} />
        <span className="hidden min-w-0 sm:block">
          <span className="block text-[11px] leading-tight text-muted-foreground">Acting as</span>
          <span className="block truncate text-[13px] leading-tight font-medium">{persona.name}</span>
        </span>
        <ChevronDown className="size-4 text-subtle" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Act as (demo personas)</DropdownMenuLabel>
          {PERSONAS.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => {
                setPersonaCookie(p.id);
                toast(`Now acting as ${p.name}`, { description: p.title });
                router.refresh();
              }}
              className="gap-2.5 py-2"
            >
              <PersonaAvatar persona={p} className="size-7" />
              <span className="flex-1">
                <span className="block text-[13px] font-medium">{p.name}</span>
                <span className="block text-[11px] text-muted-foreground">{p.title}</span>
              </span>
              {p.id === persona.id && <Check className="size-4 text-brand-fg" aria-label="Current persona" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(dark ? "light" : "dark")} className="gap-2.5 py-2">
          {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
          {dark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-start gap-2 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          <Scale className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Decision support only. Not legal advice.
            {publicDemo && <span className="mt-1 block">Public demo with synthetic data. Cases reset from time to time.</span>}
          </span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
