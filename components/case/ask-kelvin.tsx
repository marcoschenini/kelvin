"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Maximize2, X } from "lucide-react";
import { Conversation } from "@/components/chat/conversation";
import { RatelBadge } from "@/components/mascot/ratel-badge";
import { Button } from "@/components/ui/button";
import { suggestions } from "@/lib/chat/suggestions";

/**
 * "Ask Kelvin" on a case: questions about this case, answered from its documents and
 * Kelvin's rules. A docked, non-modal panel, so the sources it cites open on top of it.
 * With a model key the answers come from an AI with read-only tools; without one, from
 * built-in answers. It never changes the case.
 */
export function AskKelvin({
  caseId,
  status,
  hasClaim,
  mode,
  model,
}: {
  caseId: string;
  status: string;
  hasClaim: boolean;
  mode: "ai" | "rules";
  model: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // A short celebration when an answer arrives (the ratel's "celebrate" from our earlier project)
  const [cheer, setCheer] = useState(false);
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  /** Closes the panel (which stops an answer still streaming) and gives focus back to the button. */
  const close = () => {
    setOpen(false);
    setBusy(false);
    setTimeout(() => toggleRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape belongs to whatever is on top: the source viewer, another dialog or a menu.
      const other = document.querySelector('[data-slot="sheet-content"], [role="menu"], [role="listbox"], [role="dialog"][aria-modal="true"]');
      if (!other) {
        setOpen(false);
        setBusy(false);
        setTimeout(() => toggleRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        ref={toggleRef}
        variant="outline"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? `${titleId}-panel` : undefined}
        className="shrink-0 gap-2 pl-1.5"
      >
        <RatelBadge size={24} />
        Ask Kelvin
      </Button>

      {open && (
        <section
          id={`${titleId}-panel`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="fixed inset-x-3 bottom-3 z-40 flex max-h-[min(42rem,calc(100dvh-1.5rem))] flex-col overflow-hidden surface shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem]"
        >
          <header className="flex items-center gap-3 border-b border-border px-5 py-3">
            <RatelBadge size={40} state={busy ? "think" : cheer ? "celebrate" : "idle"} />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-heading text-[1.05rem] font-semibold">
                Ask Kelvin
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {mode === "ai" ? (
                  <>
                    AI answers · <span className="font-mono">{model}</span> · read-only
                  </>
                ) : (
                  "Built-in answers from the case file · no AI"
                )}
              </p>
            </div>
            <Link
              href={`/ask?case=${encodeURIComponent(caseId)}`}
              aria-label="Open Ask Kelvin as a page"
              title="Open as a page"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Maximize2 className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close Ask Kelvin"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <Conversation
            endpoint={`/api/cases/${encodeURIComponent(caseId)}/chat`}
            chips={suggestions(status, hasClaim)}
            onBusyChange={setBusy}
            onAnswer={(outcome) => {
              if (outcome !== "ai" && outcome !== "rules") return;
              if (cheerTimer.current) clearTimeout(cheerTimer.current);
              setCheer(true);
              cheerTimer.current = setTimeout(() => setCheer(false), 1600);
            }}
            placeholder={mode === "ai" ? "Ask anything about this case…" : "Ask about payer, deadlines, custody, quality, what if…"}
            intro={
              <p className="text-[13.5px] text-muted-foreground">
                Ask about this case: who pays and why, deadlines, custody, quality, or what would change with different facts. Every number comes from the case file and Kelvin&apos;s rules.
              </p>
            }
          />
        </section>
      )}
    </>
  );
}
