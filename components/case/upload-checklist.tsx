import { FileJson, FileSpreadsheet, FileText, Mail, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Need = "required" | "claim" | "helpful";

const NEED: Record<Need, { label: string; className: string }> = {
  required: { label: "Required", className: "bg-brand-soft text-brand-fg" },
  claim: { label: "Needed for the claim", className: "bg-warning-soft text-warning-fg" },
  helpful: { label: "Helpful", className: "bg-muted text-muted-foreground" },
};

const DOCS: { name: string; format: string; icon: LucideIcon; need: Need; reads: string }[] = [
  {
    name: "Temperature logger",
    format: "CSV",
    icon: FileSpreadsheet,
    need: "required",
    reads: "Readings every 5 minutes: whether the cargo left 2–8 °C, the peak, how long and when.",
  },
  {
    name: "Air waybill",
    format: "PDF",
    icon: FileText,
    need: "claim",
    reads: "Airline, flight, weight and declared value. The airline's liability cap is set per kg.",
  },
  {
    name: "Commercial invoice",
    format: "PDF",
    icon: FileText,
    need: "claim",
    reads: "The value of the goods, the basis of every claim.",
  },
  {
    name: "Forwarder contract",
    format: "PDF",
    icon: FileText,
    need: "claim",
    reads: "Temperature duties, liability cap, notice period and time bar.",
  },
  {
    name: "Cargo insurance policy",
    format: "PDF",
    icon: FileText,
    need: "claim",
    reads: "Whether temperature deviation is covered, exclusions, deductible and notice period.",
  },
  {
    name: "Stability data from the manufacturer",
    format: "Email (.eml)",
    icon: Mail,
    need: "claim",
    reads: "How warm and for how long the product can be. Without it the product cannot be cleared and is treated as damaged.",
  },
  {
    name: "Handling events (track & trace)",
    format: "JSON",
    icon: FileJson,
    need: "helpful",
    reads: "Who held the cargo, where and when. Matched with the logger, it shows who held it when it warmed up.",
  },
  {
    name: "Handling or irregularity reports",
    format: "PDF",
    icon: FileText,
    need: "helpful",
    reads: "Warehouse logs and incident reports that confirm the custody chain.",
  },
  {
    name: "Case emails",
    format: "Email (.eml)",
    icon: Mail,
    need: "helpful",
    reads: "Temperature alarm, document requests and replies: context and dates.",
  },
];

/** What to upload for a new case, and what Kelvin reads in each file. */
export function UploadChecklist({ className }: { className?: string }) {
  return (
    <section aria-labelledby="checklist-heading" className={cn("surface p-5 sm:p-6", className)}>
      <h3 id="checklist-heading" className="text-[1.25rem] font-semibold">
        Documents to upload
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Only the logger is needed to start. Kelvin lists anything still missing for the claim once the analysis runs.
      </p>
      <ul className="mt-4 flex flex-col divide-y divide-border">
        {DOCS.map((d) => {
          const Icon = d.icon;
          return (
            <li key={d.name} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.format}</span>
                  <span className={cn("rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold", NEED[d.need].className)}>{NEED[d.need].label}</span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{d.reads}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
