"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FileJson, FileSpreadsheet, FileText, Loader2, Mail, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function iconFor(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".csv")) return FileSpreadsheet;
  if (n.endsWith(".json")) return FileJson;
  if (n.endsWith(".eml") || n.endsWith(".txt")) return Mail;
  return FileText;
}

function kb(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadDropzone() {
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const add = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => [...prev, ...incoming.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  };

  async function submit() {
    setBusy(true);
    try {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      const res = await fetch("/api/cases", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      toast.success("Case opened", { description: `${json.documents} documents received` });
      router.push(`/cases/${json.id}`);
    } catch (e) {
      toast.error("Could not open the case", { description: e instanceof Error ? e.message : String(e) });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload case files: drop files here or press Enter to browse"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
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
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          over ? "border-ai-from bg-ai-soft" : "border-border bg-card hover:border-ai-from/40 hover:bg-ai-soft/40",
        )}
      >
        <span className={cn("grid size-12 place-items-center rounded-xl transition-colors", over ? "bg-ai text-white" : "bg-ai-soft text-ai-fg")}>
          <UploadCloud className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-[15px] font-semibold">Drop the case files here</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Logger CSV, air waybill, forwarder contract, insurance policy, commercial invoice, handling log (JSON) and emails (.eml). Kelvin
          sorts them automatically.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept=".csv,.json,.pdf,.eml,.txt"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => add(e.target.files)}
        />
      </div>

      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl border border-border bg-card p-2 shadow-card"
          >
            <ul className="divide-y divide-border">
              {files.map((f) => {
                const Icon = iconFor(f.name);
                return (
                  <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 px-3 py-2.5">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                    <span className="num text-xs text-muted-foreground">{kb(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                      className="grid size-7 place-items-center rounded-md text-subtle hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 pt-3 pb-1">
              <span className="text-xs text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"} ready. The agent starts as soon as the case opens.
              </span>
              <Button variant="ai" onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UploadCloud data-icon="inline-start" />}
                {busy ? "Opening case…" : "Open case"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
