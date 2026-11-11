/** Recovery routes and custody parties. Pure data: icons live in components/kit/party-icons.ts. */

export const RECOVERY_ROUTES = ["carrier", "forwarder", "insurer"] as const;
export type RecoveryRoute = (typeof RECOVERY_ROUTES)[number];

export const ROUTE_META: Record<RecoveryRoute, { label: string; long: string }> = {
  carrier: { label: "Carrier", long: "Airline (Montreal Convention)" },
  forwarder: { label: "Forwarder", long: "Forwarder / 3PL (contract & SLA)" },
  insurer: { label: "Insurer", long: "Cargo insurer (policy)" },
};

export const CUSTODY_PARTIES = ["shipper", "forwarder", "airline", "consignee"] as const;
export type CustodyParty = (typeof CUSTODY_PARTIES)[number];

/** Shipper and consignee share one neutral (the cargo owner's ends); forwarder and airline carry the two validated hues. */
export const CUSTODY_META: Record<CustodyParty, { label: string; colorVar: string }> = {
  shipper: { label: "Shipper", colorVar: "var(--custody-shipper)" },
  forwarder: { label: "Forwarder", colorVar: "var(--custody-forwarder)" },
  airline: { label: "Airline", colorVar: "var(--custody-airline)" },
  consignee: { label: "Consignee", colorVar: "var(--custody-consignee)" },
};
