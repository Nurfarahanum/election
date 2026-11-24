type Cell = string | number | boolean | null;

export function csv(rows: Cell[][]) {
  return "\ufeff" + rows.map(row => row.map(value => {
    const text = String(value ?? "");
    const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}

export function download(filename: string, content: string | Uint8Array, type: string) {
  return new Response(typeof content === "string" ? content : new Uint8Array(content), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
