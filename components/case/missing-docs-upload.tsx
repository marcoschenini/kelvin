"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Compact uploader that attaches files to an existing case (does not start a run). */
export function MissingDocsUpload({ caseId, missing }: { caseId: string; missing: string[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const add = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => [...prev, ...incoming.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  };

  async function submit() {
    setBusy(true);
    setStatus("Uploading…");
    try {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      const res = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      const n = json.documents as number;
      const msg = `${n} document${n === 1 ? "" : "s"} added. Re-run the analysis to use them.`;
      toast.success(msg);
      setStatus(msg);
      setFiles([]);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Could not add the documents", { description: msg });
      setStatus(`Upload failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="list-disc pl-5 text-sm">
        {missing.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div
        role="button"
        tabIndex={0}
        aria-label="Add missing documents: drop files here or press Enter to browse"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          over ? "border-ai-fg bg-ai-soft" : "border-input hover:border-ai-fg/40 hover:bg-muted/60",
        )}
      >
        <UploadCloud className="size-4" aria-hidden="true" />
        Drop files here or browse
      </div>
      <input ref={input} type="file" multiple accept=".csv,.json,.pdf,.eml,.txt" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => add(e.target.files)} />
      {files.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{files.map((f) => f.name).join(", ")}</span>
          <Button variant="outline" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UploadCloud data-icon="inline-start" />}
            {busy ? "Adding…" : `Add ${files.length} file${files.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
