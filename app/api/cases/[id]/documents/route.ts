import { cookies } from "next/headers";
import { PERSONA_COOKIE, getPersona } from "@/lib/domain/personas";
import { addDocumentsToCase } from "@/lib/intake";

const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;

/** POST multipart/form-data with one or more `files` → attaches them to the case (no run is started). */
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/documents">) {
  const { id } = await ctx.params;
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Attach at least one file." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `At most ${MAX_FILES} files.` }, { status: 400 });
  if (files.some((f) => f.size > MAX_BYTES)) return Response.json({ error: "Each file must be under 15 MB." }, { status: 400 });

  const persona = getPersona((await cookies()).get(PERSONA_COOKIE)?.value);
  const loaded = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  const n = await addDocumentsToCase(id, loaded, persona);
  if (n === null) return Response.json({ error: "Case not found." }, { status: 404 });
  return Response.json({ documents: n });
}
