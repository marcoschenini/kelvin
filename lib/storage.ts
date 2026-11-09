import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/db/client";

/**
 * File storage for case documents. Local mode writes under .data/files;
 * Supabase Storage is plugged in at deploy time (milestone 8).
 */

const FILES_DIR = path.join(DATA_DIR, "files");

function safeJoin(rel: string): string {
  const full = path.resolve(FILES_DIR, rel);
  if (!full.startsWith(FILES_DIR)) throw new Error(`Invalid storage path: ${rel}`);
  return full;
}

export async function putFile(rel: string, bytes: Uint8Array | string): Promise<void> {
  const full = safeJoin(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

export async function readFile(rel: string): Promise<Buffer> {
  return fs.readFile(safeJoin(rel));
}

export async function readText(rel: string): Promise<string> {
  return fs.readFile(safeJoin(rel), "utf8");
}

export async function removePrefix(prefix: string): Promise<void> {
  await fs.rm(safeJoin(prefix), { recursive: true, force: true });
}
