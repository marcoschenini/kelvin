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

/** "€200,000", "200.000", "200 000 euro", "200k", "1.5k", "80 mila" → number of euros */
export function parseAmount(raw: string): number | null {
  const m = /(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|mila|thousand)?/i.exec(raw);
  if (!m) return null;
  let digits = m[1];
  if (/^\d{1,3}([.,\s]\d{3})+$/.test(digits)) digits = digits.replace(/[.,\s]/g, "");
  else digits = digits.replace(",", ".");
  let n = Number(digits);
  if (!Number.isFinite(n)) return null;
  if (m[2]) n *= 1000;
  return n;
}

function parseWhatIf(q: string): WhatIf {
  const w: WhatIf = {};
  const declared = /(declared value|valore dichiarato|dichiarat\w*|declaration)([^?]*)/.exec(q);
  if (declared) {
    if (/\b(no|none|without|nessun|senza|nvd)\b/.test(declared[0]) && !/\d/.test(declared[2])) w.declaredValueEur = null;
    else {
      const n = parseAmount(declared[2]);
      if (n != null) w.declaredValueEur = n;
    }
  } else if (/\bnvd\b|no declared|senza valore dichiarato/.test(q)) {
    w.declaredValueEur = null;
  }
  const kg = /(\d+(?:[.,]\d+)?)\s*(kg|kilo|chil)/.exec(q);
  if (kg) w.weightKg = Number(kg[1].replace(",", "."));
  const days = /(\d+)\s*(days?|giorni|gg)\s*(later|after|dopo|piu tardi|in ritardo|late)?/.exec(q);
  if (days && (days[3] || /later|dopo|tardi|ritardo|late/.test(q))) w.daysLater = Number(days[1]);
  if (!declared) {
    const value = /(worth|value of the goods|goods (?:were )?worth|valore (?:della merce|delle merci)?|valesse|valessero|vale)\s*([^?]*)/.exec(q);
    if (value) {
      const n = parseAmount(value[2]);
      if (n != null && !/kg/.test(value[2])) w.valueEur = n;
    }
  }
  return w;
}

export function matchIntent(question: string): { intent: Intent; whatIf?: WhatIf } {
  const q = norm(question);
  if (has(q, /\b(what if|what would|e se|cosa succede se|cosa succederebbe|se (il|la|le|i|avessimo|fosse|pesasse)|simula|simulate|suppose|supponiamo|ipotizza)\b/)) {
    return { intent: "what_if", whatIf: parseWhatIf(q) };
  }
  if (has(q, /\b(summar\w*|riassum\w*|riepilog\w*|overview|panoramica|tl;?dr|spiega(mi)? il caso|explain the case|in breve)\b/)) return { intent: "summary" };
  if (has(q, /\b(deadline\w*|scadenz\w*|notice|avvis\w*|time.?bar|prescrizion\w*|entro quando|by when|termin\w*)\b/)) return { intent: "deadlines" };
  if (has(q, /\b(quality|qualita|usable|utilizzabil\w*|usabil\w*|damaged|danneggiat\w*|stabilit\w*|qa|buttar\w*|smaltir\w*|still good|ancora buon\w*)\b/)) return { intent: "quality" };
  if (has(q, /\b(who held|custod\w*|chi aveva|who had|where did|dove si|warm\w*|scald\w*|excursion|escursion\w*|temperatur\w*|ramp|pista)\b/)) return { intent: "custody" };
  if (has(q, /\b(why|perche|who pays|chi paga|pagator\w*|payer|insur\w*|assicura\w*|airline|compagnia|carrier|vettore|forwarder|spedizionier\w*|route|recommend\w*|consigli\w*|no claim|nessun claim|claim)\b/)) return { intent: "why_payer" };
  if (has(q, /\b(next|prossim\w*|what now|cosa devo|cosa faccio|to ?do|approv\w*|status|stato|a che punto|waiting|aspett\w*)\b/)) return { intent: "next_action" };
  if (has(q, /\b(document\w*|files?|pdf|evidence|prove|allegat\w*)\b/)) return { intent: "documents" };
  return { intent: "help" };
}
