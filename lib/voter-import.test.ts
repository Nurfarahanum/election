import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseImport, validateImport } from "./voter-import";

function workbook(lastRow = 2) {
  const xml: Record<string, string> = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pengundi" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>nama</t></is></c><c r="B1" t="inlineStr"><is><t>emel</t></is></c></row><row r="${lastRow}"><c r="A${lastRow}" t="inlineStr"><is><t>Nur Hana</t></is></c></row></sheetData></worksheet>`,
  };
  return new File([new Uint8Array(zipSync(Object.fromEntries(Object.entries(xml).map(([name, part]) => [name, strToU8(part)]))))], "voters.xlsx");
}

describe("voter import", () => {
  it("previews all 200 CSV rows with malformed values and duplicates reported on the right rows", async () => {
    const records = Array.from({ length: 200 }, (_, index) => `Pengundi ${index},voter${index}@example.com`);
    records[2] = '"Ahmad, Razak",bad-email';
    records[50] = ",voter50@example.com";
    records[199] = "Nama lain,VOTER0@example.com";
    const file = new File(["\ufeffnama,emel\r\n", records.join("\r\n")], "voters.csv");
    const rows = validateImport(await parseImport(file), [{ name: "Pengundi", email: "voter100@example.com" }]);
    expect(rows).toHaveLength(200);
    expect(rows.filter((row) => row.errors.length).map((row) => row.row)).toEqual([4, 52, 102, 201]);
    expect(rows[2].name).toBe("Ahmad, Razak");
  });

  it("reads the first worksheet and supports an empty email cell", async () => {
    const rows = validateImport(await parseImport(workbook()), []);
    expect(rows).toMatchObject([{ row: 2, name: "Nur Hana", email: "", errors: [] }]);
  });

  it("rejects oversized worksheet coordinates before expanding cells", async () => {
    await expect(parseImport(workbook(100_000_000))).rejects.toThrow("Fail tidak dapat dibaca");
  });
});
