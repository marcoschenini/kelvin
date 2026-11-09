"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { resetDemoAction } from "@/lib/actions/demo";
import { Button } from "@/components/ui/button";

export function ResetDemoButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        <RotateCcw data-icon="inline-start" />
        Reset demo
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Deletes all cases, runs, drafts and the outbox.</span>
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={() => start(() => resetDemoAction())} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
        {pending ? "Re-seeding…" : "Confirm reset"}
      </Button>
    </div>
  );
}
