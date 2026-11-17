import type { Intent, WhatIf } from "./answers";

/**
 * Maps a free-text question (English or Italian) to a built-in answer, for when no
 * language model is available. Deliberately simple and predictable: keyword groups
 * checked in a fixed order, numbers parsed for "what if" questions.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const has = (q: string, re: RegExp) => re.test(q);

/** A number with optional thousands separators: "1,200", "200.000", "200 000", "1.5", "80". */
const NUMBER = String.raw`(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)`;

function toNumber(digits: string): number {
  // Groups of three after a separator are thousands ("1,200", "200.000"); otherwise a decimal ("1.5", "1,5").
  const n = /^\d{1,3}([.,\s]\d{3})+$/.test(digits) ? Number(digits.replace(/[.,\s]/g, "")) : Number(digits.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** "€200,000", "200.000", "200 000 euro", "200k", "1.5k", "80 mila", "1.2 million", "2 milioni" → euros */
export function parseAmount(raw: string): number | null {
  const m = new RegExp(`${NUMBER}\\s*(k|mila|thousand|million|millions|mln|milion[ei]|m\\b)?`, "i").exec(raw);
  if (!m) return null;
  let n = toNumber(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  if (/^(k|mila|thousand)$/.test(unit)) n *= 1_000;
  else if (unit) n *= 1_000_000;
  return n;
}

const NO_DECLARED = /\b(no|without|senza|nessun[ao]?|niente)\s+(a\s+)?(declared value|valore dichiarato|declaration|dichiarazione)\b|\bnvd\b|\bno value declared\b/;

function parseWhatIf(q: string): WhatIf {
  const w: WhatIf = {};
  if (NO_DECLARED.test(q)) {
    w.declaredValueEur = null;
  } else {
    const declared = /(declared value|valore dichiarato|dichiarat\w*|declaration|dichiarazione)([^?]*)/.exec(q);
    if (declared) {
      const n = parseAmount(declared[2]);
      if (n != null) w.declaredValueEur = n;
    }
  }
  const kg = new RegExp(`${NUMBER}\\s*(kg|kilo|chil)`).exec(q);
  if (kg) w.weightKg = toNumber(kg[1]);
  // Any "N days / giorni" in a hypothetical means handling the claim that much later.
  const days = /(\d+)\s*(days?|giorni|gg)\b/.exec(q);
  if (days) w.daysLater = Number(days[1]);
  if (w.declaredValueEur === undefined && !/(declared value|valore dichiarato|dichiarat)/.test(q)) {
    const value = /(worth|value of the goods|goods value|valore (?:della merce|delle merci|dei farmaci)?|valesse|valessero|costasse|costassero)\s*([^?]*)/.exec(q);
    if (value && !/kg|giorni|days?/.test(value[2])) {
      const n = parseAmount(value[2]);
      if (n != null) w.valueEur = n;
    }
  }
  return w;
}

const HYPOTHETICAL = /\b(what if|what would|e se|cosa succede\w*\s+se|simula\w*|simulate|suppose|supponiamo|ipotizz\w*|ipotesi)\b/;
const CONDITIONAL_VERB = /\b(fosse|fossero|avesse|avessimo|avessero|pesasse|pesassero|valesse|valessero|costasse|aspettassimo|gestissimo|scoprissimo|dichiarassimo)\b/;

export function matchIntent(question: string): { intent: Intent; whatIf?: WhatIf } {
  const q = norm(question);
  // Requests to act: the chat is read-only, it explains who does what instead.
  if (has(q, /^(please\s+)?(send|approve|reject|draft|write|submit|email|invia|manda|approva|rifiuta|scrivi|prepara|spedisci)\b/) || has(q, /\b(can|could|would) you\s+(please\s+)?(send|approve|reject|draft|write|submit|email)\b|\b(puoi|potresti|riesci a)\s+(inviare|mandare|approvare|rifiutare|scrivere|preparare|spedire)\b/)) {
    return { intent: "action" };
  }
  if (has(q, HYPOTHETICAL) || (has(q, /\bse\b/) && has(q, CONDITIONAL_VERB))) return { intent: "what_if", whatIf: parseWhatIf(q) };
  if (has(q, /\b(summar\w*|riassum\w*|riepilog\w*|overview|panoramica|tl;?dr|spiega(mi)? il caso|explain the case|in breve)\b/)) return { intent: "summary" };
  if (has(q, /\b(been sent|was sent|is sent|sent yet|inviat\w*|spedit\w*|been approved|approvat\w*|pending|in attesa|waiting)\b/)) return { intent: "next_action" };
  if (has(q, /\b(how long|quanto tempo|per quanto|out of range|fuori (range|intervallo|soglia))\b/)) return { intent: "custody" };
  if (has(q, /\b(deadline\w*|scadenz\w*|notice|avvis\w*|time.?bar|prescrizion\w*|entro quando|by when|termin\w*)\b/)) return { intent: "deadlines" };
  if (has(q, /\b(who (should|do|can) we claim|claim (from|against)|who pays|pays?|paga|pagare|pagherebbe|chi paga|a chi (chiedere|fare|mandare)|da chi|how much|quanto (possiamo|si puo|recuper)|recover\w*|recuper\w*|montreal|deductible|franchigia|liability|responsabilit\w*|cap|limit\w*)\b/)) return { intent: "why_payer" };
  if (has(q, /\b(quality|qualita|usable|utilizzabil\w*|usabil\w*|damaged|danneggiat\w*|stabilit\w*|qa|buttar\w*|smaltir\w*|still good|ancora buon\w*)\b/)) return { intent: "quality" };
  if (has(q, /\b(who held|custod\w*|chi aveva|who had|where did|dove si|warm\w*|scald\w*|excursion|escursion\w*|temperatur\w*|ramp|pista)\b/)) return { intent: "custody" };
  if (has(q, /\b(why|perche|payer|pagator\w*|insur\w*|assicura\w*|airline|compagnia|carrier|vettore|forwarder|spedizionier\w*|route|recommend\w*|consigli\w*|no claim|nessun claim|claim)\b/)) return { intent: "why_payer" };
  if (has(q, /\b(next|prossim\w*|what now|cosa devo|cosa faccio|to ?do|status|stato|a che punto|aspett\w*)\b/)) return { intent: "next_action" };
  if (has(q, /\b(document\w*|files?|pdf|evidence|prove|allegat\w*)\b/)) return { intent: "documents" };
  return { intent: "help" };
}
