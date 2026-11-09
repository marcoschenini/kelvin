"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveRulesAction } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RulesConfig } from "@/lib/rules/config";

export function RulesForm({ rules }: { rules: RulesConfig }) {
  const [state, action, pending] = useActionState(saveRulesAction, null);
  useEffect(() => {
    if (state?.ok) toast.success("Rules saved", { description: "New runs use the updated values." });
    else if (state?.error) toast.error("Not saved", { description: state.error });
  }, [state]);
  return (
    <form action={action} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="eurPerSdr">EUR per SDR</Label>
        <Input id="eurPerSdr" name="eurPerSdr" type="number" step="0.0001" defaultValue={rules.sdr.eurPerSdr} className="num" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sdrAsOf">Rate as of</Label>
        <Input id="sdrAsOf" name="sdrAsOf" type="date" defaultValue={rules.sdr.asOf} className="num" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="earlyNoticeThresholdDays">Early notice when ≤ N days left</Label>
        <Input id="earlyNoticeThresholdDays" name="earlyNoticeThresholdDays" type="number" min={0} max={30} defaultValue={rules.earlyNoticeThresholdDays} className="num" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="atRiskDays">Red when &lt; N days left</Label>
        <Input id="atRiskDays" name="atRiskDays" type="number" min={0} max={30} defaultValue={rules.atRiskDays} className="num" />
      </div>
      <p className="col-span-2 text-xs text-muted-foreground lg:col-span-3">
        Montreal: {rules.montreal.sdrPerKg} SDR/kg (since {rules.montreal.limitEffectiveFrom}), damage notice {rules.montreal.damageNoticeDays} days, delay{" "}
        {rules.montreal.delayNoticeDays} days, time bar {rules.montreal.timeBarYears} years. Rate source: {rules.sdr.source}.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          Save rules
        </Button>
      </div>
    </form>
  );
}
