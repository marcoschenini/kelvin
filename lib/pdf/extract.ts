import "server-only";

/**
 * Text extraction with page numbers (pdfjs-dist). Items are grouped into lines
 * by their y position so clauses read naturally and quotes can be located.
 */

export interface ExtractedPage {
  page: number;
  text: string;
}

type TextItem = { str: string; transform: number[]; hasEOL?: boolean };

export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
  const pages: ExtractedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const raw of content.items as TextItem[]) {
      if (!("str" in raw) || !raw.str) continue;
      const x = raw.transform[4];
      const y = Math.round(raw.transform[5]);
      let line = lines.find((l) => Math.abs(l.y - y) <= 2);
      if (!line) {
        line = { y, parts: [] };
        lines.push(line);
      }
      line.parts.push({ x, s: raw.str });
    }
    lines.sort((a, b) => b.y - a.y);
    const text = lines
      .map((l) =>
        l.parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");
    pages.push({ page: i, text });
  }
  await doc.destroy();
  return pages;
}
