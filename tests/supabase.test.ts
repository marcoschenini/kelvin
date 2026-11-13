import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { cleanPath, storageMode, supabaseStorage } from "@/lib/storage";

/**
 * M8: the hosted path. The Postgres half runs the real DB_MODE=supabase code
 * (postgres-js driver, migrations over the wire, seed, agent) against PGlite
 * served over the Postgres protocol. The Storage half runs the REST adapter
 * against an in-memory imitation of Supabase Storage.
 */

process.env.KELVIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kelvin-supa-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

// --- In-memory Supabase Storage ---------------------------------------------------

function fakeSupabase(opts: { bucketExists?: boolean } = {}) {
  const objects = new Map<string, Uint8Array>();
  const buckets = new Set<string>(opts.bucketExists === false ? [] : ["docs"]);
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  const notFound = () => new Response(JSON.stringify({ statusCode: "404", error: "Bucket not found", message: "Bucket not found" }), { status: 400 });

  const impl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method, url: url.pathname, headers });
    if (!headers.apikey) return new Response("no apikey", { status: 401 });
    const p = url.pathname.replace(/^\/storage\/v1/, "");
    const body = init.body;

    if (p === "/bucket" && method === "POST") {
      const { id } = JSON.parse(String(body));
      if (buckets.has(id)) return new Response(JSON.stringify({ message: "The resource already exists" }), { status: 409 });
      buckets.add(id);
      return Response.json({ name: id });
    }
    let m = /^\/object\/list\/([^/]+)$/.exec(p);
    if (m && method === "POST") {
      if (!buckets.has(m[1])) return notFound();
      const { prefix, limit, offset } = JSON.parse(String(body));
      const level = new Map<string, string | null>();
      for (const key of objects.keys()) {
        const [b, ...rest] = key.split("/");
        const rel = rest.join("/");
        if (b !== m[1] || !rel.startsWith(`${prefix}/`)) continue;
        const tail = rel.slice(prefix.length + 1).split("/");
        level.set(tail[0], tail.length > 1 ? null : `id-${rel}`);
      }
      const all = [...level.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, id]) => ({ name, id }));
      return Response.json(all.slice(offset, offset + limit));
    }
    m = /^\/object\/([^/]+)$/.exec(p);
    if (m && method === "DELETE") {
      const { prefixes } = JSON.parse(String(body)) as { prefixes: string[] };
      for (const k of prefixes) objects.delete(`${m[1]}/${k}`);
      return Response.json(prefixes.map((name) => ({ name })));
    }
    m = /^\/object\/(authenticated\/)?([^/]+)\/(.+)$/.exec(p);
    if (m) {
      const bucket = decodeURIComponent(m[2]);
      const key = `${bucket}/${m[3].split("/").map(decodeURIComponent).join("/")}`;
      if (!buckets.has(bucket)) return notFound();
      if (method === "POST") {
        if (objects.has(key) && headers["x-upsert"] !== "true") return new Response("exists", { status: 409 });
        objects.set(key, typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body as Uint8Array));
        return Response.json({ Key: key });
      }
      if (method === "GET") {
        const bytes = objects.get(key);
        return bytes ? new Response(new Uint8Array(bytes)) : new Response(JSON.stringify({ error: "not_found" }), { status: 400 });
      }
    }
    return new Response("unexpected", { status: 500 });
  };
  return { fetch: impl as typeof fetch, objects, buckets, calls };
}

describe("Supabase Storage adapter", () => {
  it("writes, reads and removes nested folders through the REST API", async () => {
    const fake = fakeSupabase();
    const s = supabaseStorage({ url: "https://proj.supabase.co/", key: "eyJ.service.role", bucket: "docs", fetch: fake.fetch });
    await s.put("cases/demo-b/air waybill.pdf", new Uint8Array([1, 2, 3]));
    await s.put("cases/demo-b/logger.csv", "t,temp\n0,5");
    await s.put("cases/demo-c/sub/contract.pdf", new Uint8Array([9]));
    await s.put("eval/x.txt", "keep me");
    expect([...(await s.read("cases/demo-b/air waybill.pdf"))]).toEqual([1, 2, 3]);
    expect((await s.read("cases/demo-b/logger.csv")).toString("utf8")).toBe("t,temp\n0,5");

    await s.removePrefix("cases");
    expect([...fake.objects.keys()]).toEqual(["docs/eval/x.txt"]);
    await s.removePrefix("does-not-exist");
    await expect(s.read("cases/demo-b/logger.csv")).rejects.toThrow(/download .* failed \(400\)/);

    const upload = fake.calls.find((c) => c.method === "POST" && c.url.includes("air%20waybill.pdf"))!;
    expect(upload.headers.authorization).toBe("Bearer eyJ.service.role");
    expect(upload.headers["content-type"]).toBe("application/pdf");
    expect(upload.headers["x-upsert"]).toBe("true");
  });

  it("creates the private bucket on first write and sends new secret keys only as apikey", async () => {
    const fake = fakeSupabase({ bucketExists: false });
    const s = supabaseStorage({ url: "https://proj.supabase.co", key: "sb_secret_abc", bucket: "docs", fetch: fake.fetch });
    await s.removePrefix("cases"); // missing bucket: nothing to delete, no error
    await s.put("cases/a.pdf", new Uint8Array([7]));
    expect(fake.buckets.has("docs")).toBe(true);
    expect([...(await s.read("cases/a.pdf"))]).toEqual([7]);
    expect(fake.calls.every((c) => c.headers.apikey === "sb_secret_abc" && !c.headers.authorization)).toBe(true);
  });

  it("rejects paths that could escape the bucket root", () => {
    expect(cleanPath("cases//demo-b\\x.pdf")).toBe("cases/demo-b/x.pdf");
    expect(() => cleanPath("cases/../secrets")).toThrow(/Invalid storage path/);
    expect(() => cleanPath("")).toThrow(/Invalid storage path/);
  });

  it("uses Supabase Storage only with a hosted database and both credentials", () => {
    expect(storageMode({})).toBe("local");
    expect(storageMode({ DB_MODE: "supabase" })).toBe("local");
    expect(storageMode({ DB_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("supabase");
    expect(storageMode({ DB_MODE: "local", NEXT_PUBLIC_SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("local");
    expect(storageMode({ STORAGE_MODE: "local", DB_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("local");
  });
});

// --- Hosted Postgres path ------------------------------------------------------------

describe("DB_MODE=supabase (postgres-js over the wire)", () => {
  const NOW = new Date("2026-11-09T10:00:00Z");
  let server: PGLiteSocketServer;
  let pg: PGlite;
  let client: typeof import("@/lib/db/client");

  beforeAll(async () => {
    pg = new PGlite();
    const port = 15400 + Math.floor(Math.random() * 500);
    server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
    await server.start();
    process.env.DB_MODE = "supabase";
    process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
    process.env.DB_POOL_MAX = "1"; // PGlite is one session: keep transactions on one connection
    process.env.STORAGE_MODE = "local";
    client = await import("@/lib/db/client");
  }, 60_000);

  afterAll(async () => {
    await client?.closeDb();
    await server?.stop();
    await pg?.close();
    for (const k of ["DB_MODE", "DATABASE_URL", "DB_POOL_MAX", "STORAGE_MODE"]) delete process.env[k];
  });

  it("migrates, seeds and runs case B to the insurer claim", async () => {
    expect(client.dbMode()).toBe("supabase");
    const db = await client.getDb();
    const { resetDemo } = await import("@/seed/seed-db");
    const { runAgent } = await import("@/lib/agent/orchestrator");

    const generated = await resetDemo(db, NOW);
    expect(generated.map((g) => g.spec.code)).toEqual(["A", "B", "C"]);
    // The append-only trigger survives the wire migration.
    await expect(db.update(schema.auditEvents).set({ actorName: "x" })).rejects.toThrow();

    // The quality agent finds B damaged and the claim is prepared in the same investigate run.
    const inv = await runAgent({ db, caseId: "demo-b", kind: "investigate", mode: "deterministic", now: NOW, record: false });
    expect(inv.status).toBe("completed");

    const [letter] = await db
      .select()
      .from(schema.drafts)
      .where(and(eq(schema.drafts.caseId, "demo-b"), eq(schema.drafts.kind, "claim_letter"), eq(schema.drafts.route, "insurer")));
    expect(letter.route).toBe("insurer");
    expect(letter.amountEur).toBe(190_000);
  }, 120_000);
});
