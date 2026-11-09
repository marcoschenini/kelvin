"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_PERSONA_ID, PERSONA_COOKIE, PERSONAS, getPersona, type Persona } from "@/lib/domain/personas";
import { cn } from "@/lib/utils";

const ROLE_STYLE: Record<Persona["role"], string> = {
  qa: "bg-human-soft text-human-fg",
  manager: "bg-ai-soft text-ai-fg",
  analyst: "bg-muted text-muted-foreground",
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

export function PersonaSwitcher() {
  const persona = usePersona();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Acting as ${persona.name}, ${persona.title}. Change persona`}
      >
        <PersonaAvatar persona={persona} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted-foreground">Acting as</span>
          <span className="block truncate text-[13px] font-medium">{persona.name}</span>
        </span>
        <ChevronsUpDown className="size-4 text-subtle" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
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
              {p.id === persona.id && <Check className="size-4 text-ai-fg" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
