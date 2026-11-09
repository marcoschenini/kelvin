import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { DemoCaseCards, type DemoCaseSummary } from "@/components/case/demo-case-cards";
import { UploadDropzone } from "@/components/case/upload-dropzone";
import { DEMO_CASES } from "@/seed/cases/demo";

export const metadata: Metadata = { title: "New case" };

const SCENARIO: Record<string, string> = {
  A: "Biologics, 25 minutes at 9.2 °C during a truck transfer at the Frankfurt hub.",
  B: "90 minutes at 13 °C on the Frankfurt ramp, found eight days after delivery.",
  C: "Vaccines left on the Schiphol hub floor for four hours, peak 15 °C.",
};

const DEMOS: DemoCaseSummary[] = DEMO_CASES.map((c) => ({
  code: c.code as DemoCaseSummary["code"],
  title: c.title,
  origin: c.origin.iata,
  destination: c.destination.iata,
  valueEur: c.valueEur,
  weightKg: c.weightKg,
  product: c.product.name,
  scenario: SCENARIO[c.code],
}));

export default function NewCasePage() {
  return (
    <PageContainer className="flex flex-col gap-10">
      <PageHeader
        title="New case"
        description="Upload the shipment files or load a demo case. The agent starts on its own."
      />

      <section aria-labelledby="upload-heading" className="flex flex-col gap-3">
        <h2 id="upload-heading" className="text-[15px] font-semibold">
          Upload files
        </h2>
        <UploadDropzone />
      </section>

      <section id="demo" aria-labelledby="demo-heading" className="flex scroll-mt-8 flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-ai-fg" aria-hidden="true" />
          <h2 id="demo-heading" className="text-[15px] font-semibold">
            Demo cases
          </h2>
          <span className="text-sm text-muted-foreground">Synthetic shipments with full document sets. Loading resets the case.</span>
        </div>
        <DemoCaseCards cases={DEMOS} />
      </section>
    </PageContainer>
  );
}
