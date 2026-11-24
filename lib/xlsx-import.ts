import { zipSync } from "fflate";
import { readSheet } from "read-excel-file/node";
import { SaxesParser } from "saxes";
import { fromBufferPromise } from "yauzl";

const maxExpandedBytes = 8 * 1024 * 1024;
const maxEntries = 128;

// Validate coordinates before the spreadsheet reader expands gaps into rows and cells.
function boundWorksheet(xml: string, maxRows: number) {
  let insideSheet = false;
  let rows = 0;
  const parser = new SaxesParser();
  parser.on("opentag", ({ name, attributes }) => {
    if (name === "sheetData") insideSheet = true;
    if (!insideSheet) return;
    if (name === "row" && (++rows > maxRows || (attributes.r && !validRow(attributes.r)))) {
      throw new Error("Worksheet exceeds the row limit");
    }
    if (name === "c") {
      const address = /^([A-Z]{1,2})([1-9]\d*)$/.exec(attributes.r ?? "");
      if (!address || !validRow(address[2])) throw new Error("Worksheet cell is outside the import area");
    }
  });
  parser.on("closetag", ({ name }) => {
    if (name === "sheetData") insideSheet = false;
  });
  parser.write(xml).close();

  function validRow(value: string) {
    return /^[1-9]\d*$/.test(value) && Number(value) <= maxRows;
  }
}

export async function readBoundedSheet(bytes: Buffer, maxRows: number) {
  const archive = await fromBufferPromise(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true });
  const entries: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  try {
    if (archive.entryCount > maxEntries) throw new Error("Too many spreadsheet files");
    for await (const entry of archive.eachEntry()) {
      if (entry.fileName.endsWith("/")) continue;
      if (entry.fileName in entries || total + entry.uncompressedSize > maxExpandedBytes) {
        throw new Error("Spreadsheet archive exceeds import limits");
      }
      const chunks: Buffer[] = [];
      const stream = await archive.openReadStreamPromise(entry);
      for await (const chunk of stream) {
        total += chunk.length;
        if (total > maxExpandedBytes) throw new Error("Spreadsheet archive exceeds import limits");
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);
      if (entry.fileName.endsWith(".xml")) boundWorksheet(new TextDecoder("utf-8", { fatal: true }).decode(content), maxRows);
      entries[entry.fileName] = content;
    }
  } finally {
    archive.close();
  }

  // Parse a ZIP built exclusively from the validated entries.
  return readSheet(zipSync(entries, { level: 0 }), 1);
}
