import { expect, it } from "vitest";
import { csv, download } from "./downloads";

it("writes Excel-safe CSV and escapes fields", () => {
  expect(csv([["Nama", "Emel"], ['Ahmad, "Faiz"', "  =1+2"], ["Nur\nHana", null], ["@SUM(1)", 12]]))
    .toBe('\ufeff"Nama","Emel"\r\n"Ahmad, ""Faiz""","\'  =1+2"\r\n"Nur\nHana",""\r\n"\'@SUM(1)","12"\r\n');
});

it("sets the attachment and no-store headers", () => {
  const response = download("pengundi.csv", "a", "text/csv");
  expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="pengundi.csv"');
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
