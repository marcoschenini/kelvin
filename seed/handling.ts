import type { CaseSpec, EmailSpec } from "./spec";
import { atHours, rfc2822 } from "./time";

/** Handling events JSON, as exported from a track & trace / WMS feed. */
export function handlingEventsJson(spec: CaseSpec, delivery: Date): string {
  const events = spec.custody.map((c, i) => ({
    seq: i + 1,
    from_utc: atHours(delivery, c.fromH).toISOString(),
    to_utc: atHours(delivery, c.toH).toISOString(),
    custodian_role: c.role,
    custodian: c.custodian,
    location: c.location,
    activity: c.activity,
    temperature_controlled: c.controlled,
    reference: c.reference ?? null,
  }));
  return (
    JSON.stringify(
      {
        source: "Kelvin shipment feed (track & trace + forwarder WMS)",
        shipment_ref: spec.shipmentRef,
        awb: spec.awbNumber,
        flight: spec.flight,
        events,
      },
      null,
      2,
    ) + "\n"
  );
}

function addr(p: { name: string; email: string }) {
  return `"${p.name}" <${p.email}>`;
}

/** One RFC 822 message per email. */
export function emailEml(spec: CaseSpec, email: EmailSpec, delivery: Date, index: number): string {
  const date = atHours(delivery, email.atH);
  const headers = [
    `Message-ID: <${spec.id}-${index}@mail.kelvin.local>`,
    `Date: ${rfc2822(date)}`,
    `From: ${addr(email.from)}`,
    `To: ${addr(email.to)}`,
    ...(email.cc?.length ? [`Cc: ${email.cc.map(addr).join(", ")}`] : []),
    `Subject: ${email.subject}`,
    `X-Kelvin-Simulated: true`,
    `Content-Type: text/plain; charset=utf-8`,
  ];
  return `${headers.join("\n")}\n\n${email.body.trim()}\n`;
}
