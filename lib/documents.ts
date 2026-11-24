import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PageSizes, PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { tallyResults } from "./tally";

const ink = rgb(0.071, 0.188, 0.231);
const muted = rgb(0.29, 0.36, 0.4);
const border = rgb(0.83, 0.87, 0.89);

async function newDocument(title: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setLanguage("ms-MY");
  pdf.registerFontkit(fontkit);
  const bytes = await readFile(join(process.cwd(), "node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff"));
  const font = await pdf.embedFont(bytes, { subset: true });
  const supported = new Set(font.getCharacterSet());
  return { pdf, font, supported };
}

type DocumentFont = { font: PDFFont; supported: Set<number> };

function wrap(value: string, width: number, size: number, { font, supported }: DocumentFont) {
  const text = Array.from(value.normalize("NFC").replace(/\s+/gu, " "), char => supported.has(char.codePointAt(0)!) ? char : "?").join("");
  const result: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) result.push(line);
    line = "";
    for (const char of word) {
      if (font.widthOfTextAtSize(line + char, size) > width) {
        result.push(line);
        line = char;
      } else {
        line += char;
      }
    }
  }
  if (line) result.push(line);
  return result;
}

function drawLines(
  page: PDFPage, text: string, x: number, top: number, width: number, size: number, style: DocumentFont, maxLines?: number,
) {
  const lines = wrap(text, width, size, style);
  if (maxLines && lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (style.font.widthOfTextAtSize(last + "...", size) > width) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + "...";
  }
  for (const [index, line] of lines.entries()) {
    page.drawText(line, { x, y: top - (index + 1) * (size + 3), font: style.font, size, color: ink });
  }
  return top - lines.length * (size + 3);
}

export async function voterSlips(
  org: string, election: string, url: string, voters: { name: string; code: string; key: string }[],
) {
  const doc = await newDocument("Slip Pengundi");
  const [pageWidth, pageHeight] = PageSizes.A4;
  const margin = 28;
  const gap = 10;
  const width = (pageWidth - 2 * margin - gap) / 2;
  const height = (pageHeight - 2 * margin - 3 * gap) / 4;
  for (let start = 0; start < voters.length; start += 8) {
    const page = doc.pdf.addPage(PageSizes.A4);
    for (const [index, voter] of voters.slice(start, start + 8).entries()) {
      const x = margin + (index % 2) * (width + gap);
      const top = pageHeight - margin - Math.floor(index / 2) * (height + gap);
      page.drawRectangle({ x, y: top - height, width, height, borderColor: border, borderWidth: 1 });
      const left = x + 12;
      const inside = width - 24;
      let y = drawLines(page, "Slip Pengundi", left, top - 8, inside, 13, doc);
      y = drawLines(page, `${org} · ${election}`, left, y - 2, inside, 9, doc, 2);
      y = drawLines(page, voter.name, left, y - 5, inside, 10, doc, 2);
      y = drawLines(page, `ID Pengundi: ${voter.code}`, left, y - 3, inside, 11, doc);
      y = drawLines(page, `Kunci Pengundi: ${voter.key}`, left, y, inside, 11, doc);
      drawLines(page, url, left, y - 4, inside, 9, doc);
    }
  }
  return doc.pdf.save();
}

export async function resultsPdf(
  org: string, election: string, turnout: { eligible: number; voted: number; percent: number },
  results: ReturnType<typeof tallyResults>,
) {
  const doc = await newDocument(`Keputusan — ${election}`);
  const [width, height] = PageSizes.A4;
  const margin = 40;
  let page = doc.pdf.addPage(PageSizes.A4);
  let top = height - margin;
  function row(text: string, size = 11, gap = 4) {
    for (const line of wrap(text, width - 2 * margin, size, doc)) {
      if (top < margin + size + 3) {
        page = doc.pdf.addPage(PageSizes.A4);
        top = height - margin;
      }
      top -= size + 3;
      page.drawText(line, { x: margin, y: top, font: doc.font, size, color: size === 10 ? muted : ink });
    }
    top -= gap;
  }

  row("Keputusan pilihan raya", 19);
  row(`${org} · ${election}`, 13);
  row(`Kehadiran mengundi: ${turnout.voted} daripada ${turnout.eligible} pengundi (${turnout.percent}%)`, 11, 14);
  for (const position of results) {
    row(`${position.title} · Pilih ${position.maxChoices}`, 14);
    for (const candidate of position.candidates) {
      const flags = [
        candidate.leading && "mendahului",
        candidate.cutoffTie ? "seri pada ambang pemilihan" : candidate.tied && "seri",
      ].filter(Boolean);
      row(`${candidate.name} — ${candidate.votes} undi${flags.length ? ` · ${flags.join(", ")}` : ""}`);
    }
    row(`Tidak mengundi untuk jawatan ini: ${position.abstentions}`, 10, 12);
  }
  return doc.pdf.save();
}
