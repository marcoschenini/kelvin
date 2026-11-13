import { SectionHeader } from "@/components/kit/surfaces";
import { RouteChip } from "@/components/kit/route-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";
import type { InboxKpis } from "@/lib/queries/cases";
import { formatEUR } from "@/lib/format";

/** Compact track record per payer: how many claims, how much came back. */
export function TrackRecord({ rows }: { rows: InboxKpis["trackRecord"] }) {
  return (
    <section aria-label="Track record by payer" className="rounded-xl border border-border bg-card p-5 shadow-card">
      <SectionHeader title="Track record by payer" description="Closed claims and what they recovered" icon={Trophy} />
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No closed claims yet. The record builds up as cases close.</p>
      ) : (
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Payer</TableHead>
              <TableHead className="text-right">Claims</TableHead>
              <TableHead className="text-right">Recovered</TableHead>
              <TableHead className="text-right">Recovery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.payer}>
                <TableCell>
                  <RouteChip route={r.payer} />
                </TableCell>
                <TableCell className="num text-right">{r.claims}</TableCell>
                <TableCell className="num text-right font-medium">{formatEUR(r.recoveredEur)}</TableCell>
                <TableCell className="num text-right">{r.recoveryPct != null ? `${Math.round(r.recoveryPct)}%` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
