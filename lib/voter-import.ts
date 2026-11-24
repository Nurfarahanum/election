import { parse } from "csv-parse/sync";
import { readBoundedSheet } from "./xlsx-import";
import { z } from "zod";
import { AdminInputError } from "./admin-election";
import { emailSchema } from "./credentials";

export const maxImportRows = 500;
export const maxImportBytes = 1024 * 1024;

export const voterFields = z.object({
  name: z.string().transform((name) => name.trim().replace(/\s+/g, " ")).pipe(z.string().min(1).max(120)),
  email: z.string().trim().pipe(z.union([z.literal(""), emailSchema])),
});

type VoterFields = z.infer<typeof voterFields>;
type SourceRow = { row: number; name: string; email: string; error?: string };
export type ImportRow = SourceRow & { errors: string[] };

const headerNames = new Set(["nama", "name"]);
const headerEmails = new Set(["emel", "email", "e-mel"]);

export async function parseImport(file: File): Promise<SourceRow[]> {
  if (!file.size || file.size > maxImportBytes) {
    throw new AdminInputError("Pilih fail CSV atau XLSX sehingga 1 MB.");
  }
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (extension !== "csv" && extension !== "xlsx") throw new AdminInputError("Gunakan fail CSV atau XLSX.");
  let records: unknown[][];
  try {
    records = extension === "xlsx"
      ? await readBoundedSheet(Buffer.from(await file.arrayBuffer()), maxImportRows + 1)
      : parse(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()), { bom: true, relax_column_count: true, max_record_size: 16384, to: maxImportRows + 2 });
  } catch {
    throw new AdminInputError("Fail tidak dapat dibaca. Semak format dan cuba lagi.");
  }
  const header = headerNames.has(String(records[0]?.[0] ?? "").trim().toLowerCase())
    && (records[0].length === 1 || headerEmails.has(String(records[0][1]).trim().toLowerCase()));
  const rows = records.slice(header ? 1 : 0);
  if (!rows.length || rows.length > maxImportRows) {
    throw new AdminInputError(`Fail mesti mengandungi antara 1 hingga ${maxImportRows} baris data.`);
  }
  return rows.map((cells, index) => {
    const [name, email, ...extra] = cells;
    const invalidCells = extra.some((cell) => cell != null && cell !== "")
      || [name, email].some((cell) => cell != null && typeof cell !== "string");
    return {
      row: index + (header ? 2 : 1),
      name: String(name ?? "").slice(0, 121),
      email: String(email ?? "").slice(0, 255),
      error: invalidCells ? "Gunakan dua lajur teks (nama dan emel)." : undefined,
    };
  });
}

function identity(voter: { name: string; email: string | null }) {
  return voter.email?.trim()
    ? `email:${voter.email.trim().toLowerCase()}`
    : `name:${voter.name.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase()}`;
}

export function validateImport(
  rows: SourceRow[], existing: { name: string; email: string | null }[],
): ImportRow[] {
  const registered = new Set(existing.map(identity));
  const seen = new Set<string>();
  return rows.map((row) => {
    const errors = row.error ? [row.error] : [];
    const input = voterFields.safeParse(row);
    if (!input.success) {
      const fields = new Set(input.error.issues.map((issue) => issue.path[0]));
      if (fields.has("name")) errors.push("Nama mesti mengandungi 1 hingga 120 aksara.");
      if (fields.has("email")) errors.push("Alamat emel tidak sah.");
    }
    if (!input.success || errors.length) return { ...row, errors };
    const key = identity(input.data);
    if (registered.has(key)) errors.push("Pengundi ini sudah didaftarkan.");
    if (seen.has(key)) errors.push("Pengundi ini berulang dalam fail.");
    seen.add(key);
    return { ...row, ...input.data, errors };
  });
}

export type { VoterFields };
