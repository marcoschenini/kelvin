import type { LucideIcon } from "lucide-react";
import { Building2, Factory, Plane, ShieldCheck, Truck, Warehouse } from "lucide-react";

/** Recovery routes the agent can rank. */
export const RECOVERY_ROUTES = ["carrier", "forwarder", "insurer"] as const;
export type RecoveryRoute = (typeof RECOVERY_ROUTES)[number];

export const ROUTE_META: Record<RecoveryRoute, { label: string; long: string; icon: LucideIcon }> = {
  carrier: { label: "Carrier", long: "Airline (Montreal Convention)", icon: Plane },
  forwarder: { label: "Forwarder", long: "Forwarder / 3PL (contract & SLA)", icon: Truck },
  insurer: { label: "Insurer", long: "Cargo insurer (policy)", icon: ShieldCheck },
};

/** Parties that can hold custody of the cargo. */
export const CUSTODY_PARTIES = ["shipper", "forwarder", "airline", "consignee"] as const;
export type CustodyParty = (typeof CUSTODY_PARTIES)[number];

export const CUSTODY_META: Record<CustodyParty, { label: string; icon: LucideIcon; colorVar: string }> = {
  shipper: { label: "Shipper", icon: Factory, colorVar: "var(--custody-shipper)" },
  forwarder: { label: "Forwarder", icon: Warehouse, colorVar: "var(--custody-forwarder)" },
  airline: { label: "Airline", icon: Plane, colorVar: "var(--custody-airline)" },
  consignee: { label: "Consignee", icon: Building2, colorVar: "var(--custody-consignee)" },
};
