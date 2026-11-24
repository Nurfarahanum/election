"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { ImportRow } from "../../../lib/voter-import";
import type { IssuedKey } from "../../../lib/voter-admin";
import { sendManagement } from "../manage-client";

type Voter = { id: string; code: string; name: string; email: string | null; hasVoted: boolean };

export function VoterManager({ electionId, voters }: { electionId: string; voters: Voter[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [rows, setRows] = useState<ImportRow[]>();
  const [keys, setKeys] = useState<IssuedKey[]>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const reveal = useRef<HTMLHeadingElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const preview = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    function clearOnLeave() {
      inFlight.current?.abort();
      flushSync(() => setKeys(undefined));
    }
    window.addEventListener("pagehide", clearOnLeave);
    return () => {
      window.removeEventListener("pagehide", clearOnLeave);
      inFlight.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (keys) reveal.current?.focus();
    else if (message) notice.current?.focus();
    else if (rows) preview.current?.focus();
  }, [keys, message, rows]);

  async function run(action: string, data = new FormData(), onSuccess?: () => void) {
    if (inFlight.current || keys) return;
    const request = new AbortController();
    inFlight.current = request;
    data.set("electionId", electionId);
    data.set("action", action);
    setPending(true);
    setMessage(undefined);
    if (action === "import-preview") setRows(undefined);
    try {
      const result = await sendManagement(data, request.signal);
      if (result.rows) setRows(result.rows);
      if (result.error) setMessage({ text: result.error, error: true });
      if (result.message) {
        setMessage({ text: result.message, error: false });
        if (result.keys?.length) setKeys(result.keys);
        onSuccess?.();
        router.refresh();
      }
    } catch {
      if (!request.signal.aborted) {
        setMessage({ text: "Sambungan gagal. Semak halaman sebelum mencuba lagi.", error: true });
      }
    } finally {
      inFlight.current = null;
      setPending(false);
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void run("voter-add", new FormData(form), () => form.reset());
  }

  function importList(action: "import-preview" | "import-commit") {
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    void run(action, data, () => {
      setRows(undefined);
      setFile(undefined);
      if (input.current) input.current.value = "";
    });
  }

  function changeVoter(voter: Voter, action: "voter-remove" | "voter-regenerate") {
    const prompt = action === "voter-remove"
      ? `Buang ${voter.name} daripada senarai pengundi?`
      : `Jana semula kunci untuk ${voter.name}? Kunci lama tidak boleh digunakan lagi.`;
    if (!window.confirm(prompt)) return;
    const data = new FormData();
    data.set("voterId", voter.id);
    void run(action, data);
  }

  const disabled = pending || Boolean(keys);
  const invalidRows = rows?.filter((row) => row.errors.length).length ?? 0;

  return (
    <>
      {message && <p ref={notice} tabIndex={-1} role={message.error ? "alert" : "status"}
        className={message.error ? "form-error mb-3" : "mb-3 font-semibold text-[var(--ok)]"}>{message.text}</p>}
      {keys && (
        <section className="card" aria-labelledby="key-heading">
          <h3 ref={reveal} tabIndex={-1} id="key-heading" className="font-bold">Kunci Pengundi</h3>
          <p className="mut my-2">Salin kunci sekarang. Kunci ini hanya dipaparkan sekali.</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Senarai kunci baharu">
            <table>
              <thead><tr><th scope="col">ID Pengundi</th><th scope="col">Nama</th><th scope="col">Kunci</th></tr></thead>
              <tbody>{keys.map(({ code, name, key }) => (
                <tr key={code}><td><code>{code}</code></td><td>{name}</td><td><code>{key}</code></td></tr>
              ))}</tbody>
            </table>
          </div>
          <button className="btn mt-3" type="button" onClick={() => setKeys(undefined)}>Sembunyikan kunci</button>
        </section>
      )}

      <section className="card">
        <h3 className="font-bold">Tambah pengundi</h3>
        <form onSubmit={add}>
          <fieldset className="manage-form" disabled={disabled}>
            <label>Nama<input name="name" maxLength={120} placeholder="Nama" required /></label>
            <label>Emel (pilihan)<input name="email" type="email" maxLength={254} placeholder="Emel (pilihan)" /></label>
            <button className="btn" type="submit">Tambah</button>
          </fieldset>
        </form>
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <h3 className="font-bold">Import senarai</h3>
          <p id="import-format" className="mut my-1">Pilih fail CSV atau XLSX dengan lajur <code>nama,emel</code>. Maksimum 500 baris, 1 MB.</p>
          <form onSubmit={(event) => { event.preventDefault(); importList("import-preview"); }}>
            <fieldset className="manage-form" disabled={disabled}>
              <label>Fail pengundi<input type="file" ref={input} accept=".csv,.xlsx" required aria-describedby="import-format"
                onChange={(event) => { setFile(event.target.files?.[0]); setRows(undefined); setMessage(undefined); }} /></label>
              <button className="btn" type="submit">{pending ? "Memproses…" : "Pratonton import"}</button>
            </fieldset>
          </form>
        </div>
      </section>

      {rows && <section className="card" aria-labelledby="preview-heading">
        <h3 ref={preview} tabIndex={-1} id="preview-heading" className="font-bold">Pratonton import</h3>
        <p className="mut my-2">{rows.length} baris · {invalidRows} bermasalah</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Baris pratonton">
          <table>
            <thead><tr>{["Baris", "Nama", "Emel", "Semakan"].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.row}><td>{row.row}</td><td>{row.name}</td><td>{row.email || "—"}</td>
                <td className={row.errors.length ? "form-error" : "mut"}>{row.errors.join(" ") || "Sedia"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {invalidRows > 0 && <p className="mut mt-2">Betulkan baris bermasalah dalam fail dan semak semula.</p>}
        <button type="button" className="btn mt-3" disabled={disabled || invalidRows > 0} onClick={() => importList("import-commit")}>
          Import pengundi
        </button>
      </section>}

      <section className="card">
        <h3 className="mb-2 font-bold">Senarai pengundi <span className="chip">{voters.length}</span></h3>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Senarai pengundi berdaftar">
          <table>
            <thead><tr>{["ID", "Nama", "Emel", "Status", "Tindakan"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{voters.map((voter) => (
              <tr key={voter.id}>
                <td><code>{voter.code}</code></td>
                <td>{voter.name}</td><td>{voter.email || "—"}</td>
                <td>{voter.hasVoted ? "Sudah mengundi" : "Belum mengundi"}</td>
                <td>{!voter.hasVoted && <div className="flex flex-wrap gap-1">
                  <button type="button" className="ghost" disabled={disabled} aria-label={`Jana semula kunci untuk ${voter.name}`}
                    onClick={() => changeVoter(voter, "voter-regenerate")}>Jana semula kunci</button>
                  <button type="button" className="ghost" disabled={disabled} aria-label={`Buang pengundi ${voter.name}`}
                    onClick={() => changeVoter(voter, "voter-remove")}>Buang</button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!voters.length && <p className="mut">Belum ada pengundi.</p>}
      </section>
    </>
  );
}
