import type { LucideIcon } from "lucide-react";
import { Building2, Factory, Plane, ShieldCheck, Truck, Warehouse } from "lucide-react";
import type { CustodyParty, RecoveryRoute } from "@/lib/domain/parties";

export const ROUTE_ICON: Record<RecoveryRoute, LucideIcon> = { carrier: Plane, forwarder: Truck, insurer: ShieldCheck };
export const CUSTODY_ICON: Record<CustodyParty, LucideIcon> = { shipper: Factory, forwarder: Warehouse, airline: Plane, consignee: Building2 };
