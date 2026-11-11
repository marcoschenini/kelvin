import { connection } from "next/server";
import { getDb } from "@/lib/db/client";
import { pdfPages } from "@/lib/agent/docs";
import { getDocument } from "@/lib/queries/cases";
import { readText } from "@/lib/storage";

/**
 * GET ?page=N        → extracted text of one PDF page (for the citation viewer)
 * GET ?rows=a-b      → logger rows a..b with 3 rows of context either side
 * GET (email / json) → the raw text
 */
export async function GET(req: Request, ctx: RouteContext<"/api/documents/[id]/text">) {
  await connection();
  const { id } = await ctx.params;
  const doc = await getDocument(id);
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const base = { id: doc.id, title: doc.title, kind: doc.kind, filename: doc.filename, pages: doc.pages };

  if (doc.mime === "application/pdf") {
    const pages = await pdfPages(await getDb(), doc);
    const n = Math.min(Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1), pages.length || 1);
    return Response.json({ ...base, page: n, text: pages[n - 1]?.text ?? "" });
  }

  const raw = await readText(doc.storagePath);
  const rows = url.searchParams.get("rows");
  if (doc.kind === "logger" && rows) {
    const [a, b] = rows.split("-").map(Number);
    const lines = raw.split(/\r?\n/).filter((l) => /^\d+,/.test(l));
    const slice = lines.filter((l) => {
      const r = Number(l.split(",")[0]);
      return r >= a - 3 && r <= b + 3;
    });
    return Response.json({
      ...base,
      rows: slice.map((l) => {
        const [r, ts, c] = l.split(",");
        return { row: Number(r), at: ts, c: Number(c), cited: Number(r) >= a && Number(r) <= b };
      }),
    });
  }
  return Response.json({ ...base, text: raw.slice(0, 20_000) });
}
