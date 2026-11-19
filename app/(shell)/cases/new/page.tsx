import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { DemoCaseCards, type DemoCaseSummary } from "@/components/case/demo-case-cards";
import { UploadChecklist } from "@/components/case/upload-checklist";
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
        eyebrow="Claims operations"
        title="New case"
        description="Upload the shipment files or load a demo case. The analysis starts automatically."
      />

      <section aria-labelledby="upload-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="upload-heading" className="text-[1.2rem] font-semibold">
            Upload files
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Drop all the shipment files at once; each one is recognised on upload.</p>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <UploadDropzone className="lg:col-span-7" />
          <UploadChecklist className="lg:col-span-5" />
        </div>
      </section>

      <section id="demo" aria-labelledby="demo-heading" className="flex scroll-mt-24 flex-col gap-3">
        <div>
          <h2 id="demo-heading" className="text-[1.2rem] font-semibold">
            Demo cases
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Synthetic shipments with full document sets. Loading resets the case.</p>
        </div>
        <DemoCaseCards cases={DEMOS} />
      </section>
    </PageContainer>
  );
}
