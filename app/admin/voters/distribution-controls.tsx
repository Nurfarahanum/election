"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Action = "slips" | "invitations" | "reminders";
type Voter = { id: string; code: string; name: string; email: string | null };

export function DistributionControls({ electionId, voters }: { electionId: string; voters: Voter[] }) {
  const router = useRouter();
  const [target, setTarget] = useState("all");
  const [working, setWorking] = useState<Action>();
  const [status, setStatus] = useState<{ message: string; error?: boolean }>();
  const running = useRef(false);
  const selected = voters.find(voter => voter.id === target);
  const targetValid = target === "all" || (target === "no-email" && voters.some(voter => !voter.email)) || Boolean(selected);
  const mailDisabled = target === "no-email" || (selected ? !selected.email : !voters.some(voter => voter.email));

  async function run(action: Action) {
    if (running.current || !targetValid || (action !== "slips" && mailDisabled)) return;
    const prompt = action === "slips"
      ? "Jana slip dan kunci baharu? Kunci lama pengundi yang dipilih akan dibatalkan."
      : action === "invitations"
        ? "Hantar jemputan dengan kunci baharu? Kunci lama penerima akan dibatalkan selepas emel diterima oleh pelayan SMTP."
        : "Hantar peringatan kepada pengundi yang dipilih dan belum mengundi?";
    if (!window.confirm(prompt)) return;

    const data = new FormData();
    data.set("action", action);
    data.set("electionId", electionId);
    if (selected) data.set("voterId", selected.id);
    if (target === "no-email") data.set("withoutEmail", "true");

    running.current = true;
    setWorking(action);
    setStatus(undefined);
    try {
      const response = await fetch("/admin/distribute", { method: "POST", body: data, cache: "no-store" });
      if (response.ok && action === "slips") {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = "slip-pengundi.pdf";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus({ message: "Slip PDF dimuat turun. Simpan dan edarkan slip dengan selamat." });
      } else {
        const result = await response.json();
        if (!response.ok) {
          setStatus({ message: result.error ?? "Tindakan tidak dapat diselesaikan.", error: true });
        } else {
          const failures: string[] = result.failures;
          const skipped: string[] = result.skipped;
          const summary = [
            `${result.sent} emel diterima oleh pelayan SMTP.`,
            failures.length ? `Gagal: ${failures.join(", ")}.` : "",
            skipped.length ? `Dilangkau: ${skipped.join(", ")}.` : "",
          ].filter(Boolean);
          setStatus({ message: summary.join(" "), error: failures.length > 0 });
        }
      }
      router.refresh();
    } catch {
      setStatus({ message: "Sambungan gagal. Semak log audit sebelum mencuba lagi.", error: true });
    } finally {
      running.current = false;
      setWorking(undefined);
    }
  }

  return (
    <section className="card" aria-labelledby="distribution-title">
      <h3 className="font-bold" id="distribution-title">Edaran maklumat pengundi</h3>
      <label className="mt-2 grid gap-1">
        Pengundi yang dipilih
        <select className="distribution-select" value={target} disabled={Boolean(working)} onChange={event => setTarget(event.target.value)}>
          {!targetValid && <option value={target}>Pilihan terdahulu tidak tersedia</option>}
          <option value="all">Semua pengundi belum mengundi</option>
          {voters.some(voter => !voter.email) && <option value="no-email">Pengundi tanpa emel sahaja</option>}
          {voters.map(voter => <option key={voter.id} value={voter.id}>{voter.code} · {voter.name}</option>)}
        </select>
      </label>
      <p className="mut mt-2">Slip dan jemputan menjana kunci baharu. Peringatan menggunakan kunci yang telah diberikan.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" type="button" disabled={Boolean(working) || !targetValid} onClick={() => void run("slips")}>Muat turun slip PDF</button>
        <button className="ghost" type="button" disabled={Boolean(working) || !targetValid || mailDisabled} onClick={() => void run("invitations")}>Hantar emel jemputan</button>
        <button className="ghost" type="button" disabled={Boolean(working) || !targetValid || mailDisabled} onClick={() => void run("reminders")}>Hantar peringatan (belum mengundi)</button>
      </div>
      {working && <p role="status" className="mut mt-2">Memproses…</p>}
      {status && <p role={status.error ? "alert" : "status"} className={`mt-2 wrap-anywhere ${status.error ? "form-error" : "mut"}`}>{status.message}</p>}
    </section>
  );
}
