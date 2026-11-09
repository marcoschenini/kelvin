/**
 * The demo has no login. An "Acting as" switcher picks one of these personas so
 * every human decision is written to the audit log with a name and a role.
 */

export type PersonaRole = "qa" | "manager" | "analyst";

export interface Persona {
  id: string;
  name: string;
  initials: string;
  role: PersonaRole;
  title: string;
}

export const PERSONAS: readonly Persona[] = [
  { id: "elena", name: "Elena Weber", initials: "EW", role: "qa", title: "QA Lead" },
  { id: "tom", name: "Tom Becker", initials: "TB", role: "manager", title: "Claims Manager" },
  { id: "sara", name: "Sara Lindqvist", initials: "SL", role: "analyst", title: "Logistics Analyst" },
] as const;

export const DEFAULT_PERSONA_ID = "tom";
export const PERSONA_COOKIE = "kelvin-actor";

export function getPersona(id: string | undefined | null): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID)!;
}

/** Which human gate a role is allowed to act on. */
export const ROLE_CAN: Record<PersonaRole, { qaGate: boolean; approvalGate: boolean }> = {
  qa: { qaGate: true, approvalGate: false },
  manager: { qaGate: false, approvalGate: true },
  analyst: { qaGate: false, approvalGate: false },
};
