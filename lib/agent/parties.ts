import type { DB } from "@/lib/db/client";
import type { Citation } from "@/lib/domain/citation";
import type { RecoveryRoute } from "@/lib/domain/parties";
import { findDocument, pdfPages } from "./docs";

/**
 * Resolves who to write to for a route, from the documents themselves:
 * carrier = issuing carrier on the air waybill, forwarder = contract
 * counterparty letterhead, insurer = policy letterhead.
 */
export interface Counterparty {
  route: RecoveryRoute;
  name: string;
  email: string;
  source: Citation | null;
  assumed: boolean;
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;

export async function resolveCounterparty(db: DB, caseId: string, route: RecoveryRoute): Promise<Counterparty> {
  const kind = route === "carrier" ? "awb" : route === "forwarder" ? "contract" : "policy";
  const doc = await findDocument(db, caseId, kind);
  if (doc) {
    const pages = await pdfPages(db, doc);
    const lines = (pages[0]?.text ?? "").split("\n");
    let name: string | undefined;
    if (route === "carrier") {
      const i = lines.findIndex((l) => /AIR WAYBILL NUMBER/.test(l));
      name = lines[i + 1]?.replace(/^\d{3}-\d{4}\s?\d{4}\s*/, "").trim() || lines[0]?.replace(/\s*-\s*Air Waybill$/i, "").trim();
    } else {
      name = lines[0]?.trim();
    }
    const emailLine = lines.slice(0, 6).find((l) => EMAIL.test(l));
    const email = emailLine?.match(EMAIL)?.[0];
    if (name && email) {
      return {
        route,
        name,
        email,
        assumed: false,
        source: {
          kind: "document",
          documentId: doc.id,
          page: 1,
          label: `${route === "carrier" ? "AWB" : route === "forwarder" ? "Contract" : "Policy"} p.1 (address)`,
          title: `${name} contact details`,
          quote: emailLine,
        },
      };
    }
    if (name) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return { route, name, email: `claims@${slug}.example`, assumed: true, source: null };
    }
  }
  return { route, name: `${route[0].toUpperCase()}${route.slice(1)} (unknown)`, email: `claims@unknown-${route}.example`, assumed: true, source: null };
}
