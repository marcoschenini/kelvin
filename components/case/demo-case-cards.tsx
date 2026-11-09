"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2, Play } from "lucide-react";
import { loadDemoCaseAction } from "@/lib/actions/demo";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/format";

export interface DemoCaseSummary {
  code: "A" | "B" | "C";
  title: string;
  origin: string;
  destination: string;
  valueEur: number;
  weightKg: number;
  product: string;
  scenario: string;
}

function LoadButton({ code }: { code: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
      {pending ? "Preparing documents…" : `Load demo case ${code}`}
    </Button>
  );
}

export function DemoCaseCards({ cases }: { cases: DemoCaseSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {cases.map((c) => (
        <form
          key={c.code}
          action={loadDemoCaseAction.bind(null, c.code)}
          className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-raised"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="num grid size-10 place-items-center rounded-xl bg-ai-soft text-base font-semibold text-ai-fg">{c.code}</span>
            <span className="num inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
              {c.origin}
              <ArrowRight className="size-3.5" aria-label="to" />
              {c.destination}
            </span>
          </div>
          <div>
            <h3 className="text-[15px] leading-snug font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{c.scenario}</p>
          </div>
          <dl className="num mt-auto grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Value</dt>
              <dd className="mt-0.5 font-semibold">{formatEUR(c.valueEur)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Weight</dt>
              <dd className="mt-0.5 font-semibold">{c.weightKg} kg</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Product</dt>
              <dd className="mt-0.5 truncate font-semibold" title={c.product}>
                {c.product.split(" ")[0]}
              </dd>
            </div>
          </dl>
          <LoadButton code={c.code} />
        </form>
      ))}
    </div>
  );
}
