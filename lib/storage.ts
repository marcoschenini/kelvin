import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/db/client";

/**
 * File storage for case documents (PDFs, CSV logger exports, e-mails).
 *
 *  local    (default) files under .data/files on this machine
 *  supabase a private Supabase Storage bucket, shared by every instance
 *
 * Supabase is used when DB_MODE=supabase and both NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set, so documents live next to the shared
 * database. STORAGE_MODE=local|supabase overrides the choice. The service key is
 * server-only: documents reach the browser through /api/documents, never directly.
 */

export interface Storage {
  readonly mode: "local" | "supabase";
  put(rel: string, bytes: Uint8Array | string): Promise<void>;
  read(rel: string): Promise<Buffer>;
  /** Removes every file under a folder (no-op when it does not exist). */
  removePrefix(prefix: string): Promise<void>;
}

/** Normalises a storage path and rejects anything that could escape the root. */
export function cleanPath(rel: string): string {
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => p === "." || p === "..")) throw new Error(`Invalid storage path: ${rel}`);
  return parts.join("/");
}

// --- Local filesystem ---------------------------------------------------------

export function fsStorage(root = path.join(DATA_DIR, "files")): Storage {
  const full = (rel: string) => path.join(root, ...cleanPath(rel).split("/"));
  return {
    mode: "local",
    async put(rel, bytes) {
      const f = full(rel);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, bytes);
    },
    read: (rel) => fs.readFile(full(rel)),
    async removePrefix(prefix) {
      await fs.rm(full(prefix), { recursive: true, force: true });
    },
  };
}

// --- Supabase Storage (REST API) ----------------------------------------------

export type SupabaseStorageOptions = {
  url: string;
  key: string;
  bucket: string;
  fetch?: typeof fetch;
};

type ListEntry = { name: string; id: string | null };

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  eml: "message/rfc822",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
};

export function supabaseStorage(opts: SupabaseStorageOptions): Storage {
  const base = `${opts.url.replace(/\/+$/, "")}/storage/v1`;
  const doFetch = opts.fetch ?? fetch;
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys only in apikey.
  const auth: Record<string, string> = { apikey: opts.key };
  if (opts.key.startsWith("eyJ")) auth.Authorization = `Bearer ${opts.key}`;
  const objectUrl = (rel: string) => `${base}/object/${encodeURIComponent(opts.bucket)}/${cleanPath(rel).split("/").map(encodeURIComponent).join("/")}`;

  async function fail(res: Response, what: string): Promise<never> {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase Storage ${what} failed (${res.status}): ${body.slice(0, 300)}`);
  }

  let bucketReady: Promise<void> | null = null;
  /** Creates the private bucket the first time a write finds it missing. */
  function ensureBucket(): Promise<void> {
    bucketReady ??= (async () => {
      const res = await doFetch(`${base}/bucket`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ id: opts.bucket, name: opts.bucket, public: false }),
      });
      // 409 / "already exists" means another instance created it first.
      if (!res.ok && res.status !== 409) {
        const text = await res.text().catch(() => "");
        if (!/already exists|Duplicate/i.test(text)) throw new Error(`Supabase Storage create bucket failed (${res.status}): ${text.slice(0, 300)}`);
      }
    })().catch((e) => {
      bucketReady = null;
      throw e;
    });
    return bucketReady;
  }

  const isMissingBucket = (status: number, text: string) => (status === 404 || status === 400) && /bucket not found/i.test(text);

  async function upload(rel: string, body: Uint8Array | string) {
    const ext = rel.split(".").pop()?.toLowerCase() ?? "";
    return doFetch(objectUrl(rel), {
      method: "POST",
      headers: { ...auth, "Content-Type": MIME[ext] ?? "application/octet-stream", "x-upsert": "true" },
      body: typeof body === "string" ? body : new Uint8Array(body),
    });
  }

  /** Every file path under a folder; Supabase lists one level at a time, folders have id null. */
  async function listFiles(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const res = await doFetch(`${base}/object/list/${encodeURIComponent(opts.bucket)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: pageSize, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (isMissingBucket(res.status, text)) return out;
        throw new Error(`Supabase Storage list failed (${res.status}): ${text.slice(0, 300)}`);
      }
      const entries = (await res.json()) as ListEntry[];
      for (const e of entries) {
        const p = `${prefix}/${e.name}`;
        if (e.id === null) out.push(...(await listFiles(p)));
        else out.push(p);
      }
      if (entries.length < pageSize) return out;
    }
  }

  return {
    mode: "supabase",
    async put(rel, bytes) {
      let res = await upload(rel, bytes);
      if (!res.ok) {
        const text = await res.clone().text().catch(() => "");
        if (!isMissingBucket(res.status, text)) await fail(res, `upload ${rel}`);
        await ensureBucket();
        res = await upload(rel, bytes);
        if (!res.ok) await fail(res, `upload ${rel}`);
      }
    },
    async read(rel) {
      const res = await doFetch(objectUrl(rel).replace("/object/", "/object/authenticated/"), { headers: auth });
      if (!res.ok) await fail(res, `download ${rel}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async removePrefix(prefix) {
      const files = await listFiles(cleanPath(prefix));
      for (let i = 0; i < files.length; i += 500) {
        const res = await doFetch(`${base}/object/${encodeURIComponent(opts.bucket)}`, {
          method: "DELETE",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: files.slice(i, i + 500) }),
        });
        if (!res.ok) await fail(res, `delete under ${prefix}`);
      }
    },
  };
}

// --- Selection ----------------------------------------------------------------

export function storageMode(env: Record<string, string | undefined> = process.env): "local" | "supabase" {
  if (env.STORAGE_MODE === "local" || env.STORAGE_MODE === "supabase") return env.STORAGE_MODE;
  return env.DB_MODE === "supabase" && !!env.NEXT_PUBLIC_SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
}

const g = globalThis as unknown as { __kelvinStorage?: Storage };

export function getStorage(): Storage {
  if (!g.__kelvinStorage) {
    if (storageMode() === "supabase") {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("Supabase Storage needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
      g.__kelvinStorage = supabaseStorage({ url, key, bucket: process.env.SUPABASE_BUCKET || "kelvin-documents" });
    } else {
      g.__kelvinStorage = fsStorage();
    }
  }
  return g.__kelvinStorage;
}

// --- Call sites (unchanged API) -----------------------------------------------

export const putFile = (rel: string, bytes: Uint8Array | string) => getStorage().put(rel, bytes);
export const readFile = (rel: string) => getStorage().read(rel);
export const readText = async (rel: string) => (await getStorage().read(rel)).toString("utf8");
export const removePrefix = (prefix: string) => getStorage().removePrefix(prefix);
