import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";

/**
 * Minimal document layout engine on top of pdf-lib: letterhead, headings,
 * wrapped paragraphs, numbered clauses with hanging indents, key/value blocks,
 * tables and "Page X of N" footers. Text stays real text so pdfjs can extract
 * it with page numbers for citations.
 */

export const A4 = { w: 595.28, h: 841.89 };
const MARGIN = { top: 64, bottom: 64, left: 64, right: 64 };

const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.4, 0.45, 0.52);
const HAIRLINE = rgb(0.85, 0.87, 0.9);

/** Standard PDF fonts only encode WinAnsi: replace anything else. */
export function winAnsi(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/×/g, "x")
    .replace(/−/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ€–—•…]/g, "?");
}

export interface Letterhead {
  name: string;
  lines: string[];
  accent: RGB;
}

export class DocBuilder {
  pdf!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  italic!: PDFFont;
  page!: PDFPage;
  y = 0;
  private constructor(
    private opts: { title: string; letterhead: Letterhead; docRef: string; confidential?: boolean },
  ) {}

  static async create(opts: { title: string; letterhead: Letterhead; docRef: string; confidential?: boolean }) {
    const b = new DocBuilder(opts);
    b.pdf = await PDFDocument.create();
    b.pdf.setTitle(winAnsi(opts.title));
    b.pdf.setProducer("Kelvin synthetic data generator");
    b.pdf.setCreator("Kelvin");
    b.font = await b.pdf.embedFont(StandardFonts.Helvetica);
    b.bold = await b.pdf.embedFont(StandardFonts.HelveticaBold);
    b.italic = await b.pdf.embedFont(StandardFonts.HelveticaOblique);
    b.newPage(true);
    return b;
  }

  get contentWidth() {
    return A4.w - MARGIN.left - MARGIN.right;
  }

  newPage(first = false) {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    const { letterhead } = this.opts;
    // accent rule
    this.page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: letterhead.accent });
    if (first) {
      this.page.drawText(winAnsi(letterhead.name), { x: MARGIN.left, y: A4.h - 52, size: 15, font: this.bold, color: INK });
      letterhead.lines.forEach((l, i) =>
        this.page.drawText(winAnsi(l), { x: MARGIN.left, y: A4.h - 68 - i * 11, size: 8, font: this.font, color: MUTED }),
      );
      this.y = A4.h - 68 - letterhead.lines.length * 11 - 18;
      this.rule();
      this.y -= 6;
    } else {
      this.page.drawText(winAnsi(`${letterhead.name}  |  ${this.opts.title}`), {
        x: MARGIN.left,
        y: A4.h - 36,
        size: 7.5,
        font: this.font,
        color: MUTED,
      });
      this.y = A4.h - MARGIN.top;
    }
  }

  ensure(h: number) {
    if (this.y - h < MARGIN.bottom) this.newPage();
  }

  space(h = 8) {
    this.y -= h;
  }

  rule(color = HAIRLINE) {
    this.page.drawLine({
      start: { x: MARGIN.left, y: this.y },
      end: { x: A4.w - MARGIN.right, y: this.y },
      thickness: 0.6,
      color,
    });
  }

  wrap(text: string, font: PDFFont, size: number, width: number, firstLineWidth = width): string[] {
    const out: string[] = [];
    for (const para of winAnsi(text).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = "";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        const max = out.length === 0 ? firstLineWidth : width;
        if (font.widthOfTextAtSize(next, size) > max && line) {
          out.push(line);
          line = w;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }

  title(text: string, sub?: string) {
    this.ensure(50);
    this.y -= 18;
    this.page.drawText(winAnsi(text), { x: MARGIN.left, y: this.y, size: 17, font: this.bold, color: INK });
    if (sub) {
      this.y -= 16;
      this.page.drawText(winAnsi(sub), { x: MARGIN.left, y: this.y, size: 9.5, font: this.font, color: MUTED });
    }
    this.y -= 18;
  }

  heading(text: string) {
    this.ensure(40);
    this.y -= 14;
    this.page.drawText(winAnsi(text.toUpperCase()), {
      x: MARGIN.left,
      y: this.y,
      size: 9.5,
      font: this.bold,
      color: this.opts.letterhead.accent,
    });
    this.y -= 6;
    this.rule();
    this.y -= 12;
  }

  para(text: string, opts: { size?: number; font?: "regular" | "bold" | "italic"; indent?: number; color?: RGB; gap?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.font === "bold" ? this.bold : opts.font === "italic" ? this.italic : this.font;
    const indent = opts.indent ?? 0;
    const lh = size * 1.42;
    for (const line of this.wrap(text, font, size, this.contentWidth - indent)) {
      this.ensure(lh);
      this.page.drawText(line, { x: MARGIN.left + indent, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 5;
  }

  /** "7.1  Title. Body…" with a hanging indent. */
  clause(num: string, title: string | null, body: string) {
    const size = 9.5;
    const lh = size * 1.42;
    const indent = 34;
    const t = title ? winAnsi(`${title}.`) : "";
    // The bold title is wider than its regular-font measurement: shorten the first line accordingly.
    const extra = t ? this.bold.widthOfTextAtSize(t, size) - this.font.widthOfTextAtSize(t, size) : 0;
    const width = this.contentWidth - indent;
    const lines = this.wrap(`${t ? `${t} ` : ""}${body}`, this.font, size, width, width - extra);
    this.ensure(lh * Math.min(lines.length, 3));
    this.page.drawText(winAnsi(num), { x: MARGIN.left, y: this.y, size, font: this.bold, color: INK });
    lines.forEach((line, i) => {
      this.ensure(lh);
      if (i === 0 && t) {
        this.page.drawText(t, { x: MARGIN.left + indent, y: this.y, size, font: this.bold, color: INK });
        const tw = this.bold.widthOfTextAtSize(t, size) + this.font.widthOfTextAtSize(" ", size);
        this.page.drawText(line.slice(t.length + 1), { x: MARGIN.left + indent + tw, y: this.y, size, font: this.font, color: INK });
      } else {
        this.page.drawText(line, { x: MARGIN.left + indent, y: this.y, size, font: this.font, color: INK });
      }
      this.y -= lh;
    });
    this.y -= 4;
  }

  /** Two-column label/value block. */
  kv(rows: [string, string][], labelWidth = 150) {
    const size = 9.5;
    const lh = size * 1.45;
    for (const [k, v] of rows) {
      const lines = this.wrap(v, this.font, size, this.contentWidth - labelWidth);
      this.ensure(lh * lines.length);
      this.page.drawText(winAnsi(k), { x: MARGIN.left, y: this.y, size, font: this.bold, color: MUTED });
      lines.forEach((l, i) => {
        this.page.drawText(l, { x: MARGIN.left + labelWidth, y: this.y - i * lh, size, font: this.font, color: INK });
      });
      this.y -= lh * lines.length + 2;
    }
    this.y -= 4;
  }

  table(columns: { header: string; width: number; align?: "left" | "right" }[], rows: string[][], opts: { size?: number } = {}) {
    const size = opts.size ?? 8.5;
    const lh = size * 1.5;
    const total = columns.reduce((s, c) => s + c.width, 0);
    const scale = this.contentWidth / total;
    const xs: number[] = [];
    let x = MARGIN.left;
    for (const c of columns) {
      xs.push(x);
      x += c.width * scale;
    }
    const drawRow = (cells: string[], font: PDFFont, shade: boolean) => {
      const wrapped = cells.map((c, i) => this.wrap(c, font, size, columns[i].width * scale - 8));
      const h = Math.max(...wrapped.map((w) => w.length)) * lh + 4;
      this.ensure(h);
      if (shade) {
        this.page.drawRectangle({
          x: MARGIN.left,
          y: this.y - h + lh - 2,
          width: this.contentWidth,
          height: h,
          color: rgb(0.95, 0.96, 0.98),
        });
      }
      wrapped.forEach((lines, i) => {
        lines.forEach((l, j) => {
          const col = columns[i];
          const w = font.widthOfTextAtSize(l, size);
          const cx = col.align === "right" ? xs[i] + col.width * scale - 4 - w : xs[i] + 4;
          this.page.drawText(l, { x: cx, y: this.y - j * lh, size, font, color: INK });
        });
      });
      this.y -= h;
    };
    drawRow(
      columns.map((c) => c.header),
      this.bold,
      true,
    );
    rows.forEach((r) => drawRow(r, this.font, false));
    this.y -= 6;
  }

  signature(lines: string[]) {
    this.ensure(70);
    this.y -= 26;
    this.page.drawLine({
      start: { x: MARGIN.left, y: this.y },
      end: { x: MARGIN.left + 180, y: this.y },
      thickness: 0.6,
      color: MUTED,
    });
    this.y -= 12;
    for (const l of lines) {
      this.page.drawText(winAnsi(l), { x: MARGIN.left, y: this.y, size: 8.5, font: this.font, color: MUTED });
      this.y -= 11;
    }
  }

  async finish(): Promise<{ bytes: Uint8Array; pages: number }> {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      const label = winAnsi(`${this.opts.docRef}${this.opts.confidential ? "  |  Confidential" : ""}`);
      p.drawLine({ start: { x: MARGIN.left, y: 44 }, end: { x: A4.w - MARGIN.right, y: 44 }, thickness: 0.5, color: HAIRLINE });
      p.drawText(label, { x: MARGIN.left, y: 32, size: 7.5, font: this.font, color: MUTED });
      const pn = `Page ${i + 1} of ${pages.length}`;
      p.drawText(pn, { x: A4.w - MARGIN.right - this.font.widthOfTextAtSize(pn, 7.5), y: 32, size: 7.5, font: this.font, color: MUTED });
    });
    return { bytes: await this.pdf.save(), pages: pages.length };
  }
}

export const ACCENTS = {
  shipper: rgb(0.31, 0.27, 0.9),
  forwarder: rgb(0.03, 0.57, 0.7),
  airline: rgb(0.39, 0.4, 0.95),
  insurer: rgb(0.06, 0.46, 0.43),
  handler: rgb(0.85, 0.47, 0.02),
} as const;

export function partyLines(p: { address: string[]; email: string; phone?: string }): string[] {
  return [p.address.join(", "), [p.phone, p.email].filter(Boolean).join("  |  ")];
}
