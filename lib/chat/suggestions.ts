/** Questions offered as one-click chips in "Ask Kelvin", depending on where the case is. Client-safe. */
export function suggestions(status: string, hasClaim: boolean): string[] {
  if (status === "new" || status === "investigating") return ["What should I do next?", "Summarize the case"];
  const base = ["Summarize the case", "Who held the cargo when it warmed up?", "Is the product still usable?"];
  if (!hasClaim) return [...base, "Why no claim?", "What if the goods were worth €80,000?"];
  return [
    "Why this payer?",
    "What are the deadlines?",
    ...base,
    "What should I do next?",
    "What if the declared value were €200,000?",
    "What if we handled it 10 days later?",
  ];
}

/** What the model is reading, for the quiet status line while it works. */
export const CHAT_TOOL_LABEL: Record<string, string> = {
  case_summary: "Reading the case overview",
  explain_recommendation: "Checking the recovery routes",
  list_deadlines: "Checking the deadlines",
  custody_at_excursion: "Checking who held the cargo",
  quality_assessment: "Reading the quality assessment",
  next_action: "Checking what is pending",
  list_documents: "Listing the documents",
  what_if: "Re-running the rules with your changes",
  portfolio_overview: "Looking at all cases",
  pending_actions: "Checking what is waiting on people",
  upcoming_deadlines: "Checking deadlines across cases",
  ask_about_case: "Reading the case",
};

/** Questions for "All cases" on the Ask Kelvin page, naming the demo cases that exist. */
export function portfolioSuggestions(codes: string[]): string[] {
  const has = (c: string) => codes.includes(c);
  return [
    "Which cases need my attention?",
    "How much is at stake?",
    "What deadlines are coming up?",
    ...(has("B") ? ["Why does case B go to the insurer?", "What if case B had a declared value of €200,000?"] : []),
    ...(has("C") ? ["Summarize case C"] : []),
    ...(has("A") ? ["Why is there no claim on case A?"] : []),
  ];
}
