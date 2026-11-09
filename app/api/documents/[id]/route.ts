import { connection } from "next/server";
import { getDocument } from "@/lib/queries/cases";
import { readFile } from "@/lib/storage";

/** Serves a case document inline (PDFs open in the browser viewer; .eml and data files as text). */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const doc = await getDocument(id);
  if (!doc) return new Response("Not found", { status: 404 });
  const bytes = await readFile(doc.storagePath);
  const type =
    doc.mime === "application/pdf"
      ? "application/pdf"
      : doc.mime === "application/json"
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
