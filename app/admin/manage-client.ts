import type { ImportRow } from "../../lib/voter-import";
import type { IssuedKey } from "../../lib/voter-admin";

export type ManageResult = { error?: string; message?: string; rows?: ImportRow[]; keys?: IssuedKey[] };

export async function sendManagement(data: FormData, signal?: AbortSignal): Promise<ManageResult> {
  const response = await fetch("/admin/manage", { method: "POST", body: data, cache: "no-store", signal });
  if (response.status === 413) return { error: "Fail melebihi saiz yang dibenarkan." };
  return response.json();
}
