import { cookies } from "next/headers";
import { PERSONA_COOKIE, getPersona } from "@/lib/domain/personas";
import { createCaseFromUpload } from "@/lib/intake";

const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;

/** POST multipart/form-data with one or more `files` → creates a case. */
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Attach at least one file." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `At most ${MAX_FILES} files.` }, { status: 400 });
  if (files.some((f) => f.size > MAX_BYTES)) return Response.json({ error: "Each file must be under 15 MB." }, { status: 400 });

  const jar = await cookies();
  const persona = getPersona(jar.get(PERSONA_COOKIE)?.value);
  const loaded = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  const result = await createCaseFromUpload(loaded, persona);
  return Response.json(result, { status: 201 });
}
