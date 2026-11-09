import { formatEUR } from "@/lib/format";
import type { CaseSpec } from "../spec";
import { ACCENTS, DocBuilder, partyLines } from "./kit";

/** Marine cargo open-cover policy with a temperature-deviation extension. */
export async function policyPdf(spec: CaseSpec) {
  const p = spec.policy;
  const ins = spec.insurer;
  const d = await DocBuilder.create({
    title: p.title,
    letterhead: { name: ins.name, lines: partyLines(ins), accent: ACCENTS.insurer },
    docRef: `Policy ${p.policyNumber}`,
  });

  d.title(p.title, `Policy no. ${p.policyNumber}`);
  d.heading("Schedule");
  d.kv([
    ["Insured", `${spec.shipper.name}, ${spec.shipper.address.join(", ")}`],
    ["Period of insurance", `${p.periodFrom} to ${p.periodTo}, both days inclusive`],
    ["Interest", "Pharmaceutical products requiring controlled temperature (+2 °C to +8 °C)"],
    ["Conveyances", "Air freight, road feeder and warehousing incidental to transit, worldwide"],
    ["Basis of valuation", `${p.insuredPercentOfInvoice}% of the commercial invoice value`],
    ["Limit per conveyance", "EUR 2,500,000"],
    ["Deductible", `${formatEUR(p.deductibleEur)} each and every claim`],
    ["Conditions", "Institute Cargo Clauses (Air) (excluding sendings by Post), as amended by this policy"],
  ]);

  d.heading("1. Insuring clause");
  d.clause(
    "1.1",
    "Cover",
    "Subject to the terms, conditions and exclusions of this policy, the Insurer will indemnify the Insured for physical loss of or damage to the subject-matter insured occurring during the period of transit.",
  );
  d.clause(
    "1.2",
    "Duration",
    "Cover attaches when the subject-matter insured leaves the Insured's premises for the commencement of transit and continues until delivery to the consignee's premises.",
  );

  d.heading("2. Temperature deviation extension");
  if (p.temperatureCover) {
    d.clause(
      "2.1",
      "Cover",
      "This policy is extended to cover physical loss of or damage to the subject-matter insured caused by a deviation from the temperature range stated in the shipping documents, as recorded by the accompanying data logger.",
    );
    d.clause(
      "2.2",
      "Damage",
      "Goods shall be deemed damaged where the Insured's Quality Assurance, acting reasonably and in accordance with documented stability data, rejects them as a consequence of the deviation. Goods released by Quality Assurance are not damaged within the meaning of this policy.",
    );
    if (p.minDeviationMinutes > 0) {
      d.clause(
        "2.3",
        "Minimum duration",
        `Deviations lasting less than ${p.minDeviationMinutes} consecutive minutes are not covered under this extension.`,
      );
    }
  } else {
    d.clause(
      "2.1",
      "Not covered",
      "Loss or damage caused by variation in temperature is not covered under this policy unless resulting from an accident to the conveyance.",
    );
  }

  d.heading("3. Exclusions");
  const ex = [
    "Loss, damage or expense attributable to wilful misconduct of the Insured.",
    "Ordinary leakage, ordinary loss in weight or volume, or ordinary wear and tear of the subject-matter insured.",
    "Loss, damage or expense caused by insufficiency or unsuitability of packing or preparation of the subject-matter insured, where such packing is carried out by the Insured or its employees.",
    "Loss, damage or expense caused by inherent vice or nature of the subject-matter insured.",
    "Loss, damage or expense caused by delay, even though the delay be caused by a risk insured against.",
    "Loss, damage or expense arising from the failure to dispatch the subject-matter insured with a functioning data logger.",
    ...(p.extraExclusions ?? []),
  ];
  ex.forEach((t, i) => d.clause(`3.${i + 1}`, null, t));

  d.heading("4. Basis of settlement");
  d.clause(
    "4.1",
    "Measure of indemnity",
    `In the event of total loss of the affected goods the Insurer will pay the insured value (${p.insuredPercentOfInvoice}% of invoice value) less the deductible stated in the Schedule.`,
  );
  d.clause("4.2", "Salvage", "Any salvage proceeds or destruction costs shall be taken into account in the settlement.");

  d.heading("5. Claims");
  d.clause(
    "5.1",
    "Notification",
    `The Insured shall notify the Insurer in writing of any loss or damage that may give rise to a claim as soon as practicable and in any event within ${p.noticeDays} days of discovery.`,
  );
  d.clause(
    "5.2",
    "Documents",
    "A claim shall be supported by the original data logger file, the air waybill, the commercial invoice, the Quality Assurance disposition and all correspondence with carriers and bailees.",
  );
  d.clause(
    "5.3",
    "Duty of the Insured - preservation of rights",
    "It is the duty of the Insured to ensure that all rights against carriers, bailees or other third parties are properly preserved and exercised, including by giving written notice of damage within the time limits applicable under the relevant contract or convention. The Insurer may reduce any claim to the extent of prejudice caused by a failure to do so.",
  );
  d.clause(
    "5.4",
    "Subrogation",
    "Upon payment of a claim the Insurer is subrogated to all rights of the Insured against third parties in respect of the loss.",
  );

  d.heading("6. Law and jurisdiction");
  d.clause("6.1", null, "This policy is subject to the law of the Insurer's seat and the exclusive jurisdiction of its courts.");
  d.signature([`For ${ins.name}`, "Marine Cargo Underwriting"]);
  return d.finish();
}
