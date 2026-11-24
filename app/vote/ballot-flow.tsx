"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { BallotPosition, Selection } from "../../lib/ballot-selection";

export function VoterLogout() {
  return <form method="post" action="/vote/logout"><button className="ghost" type="submit">Keluar</button></form>;
}

export function VoteConfirmation({ name }: { name: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section className="card mx-auto my-6 max-w-[420px]" aria-labelledby="vote-confirmation">
      <h2 id="vote-confirmation" ref={heading} tabIndex={-1} className="text-lg font-bold text-[var(--ok)]">
        Undi anda telah direkodkan
      </h2>
      <p className="my-3">Terima kasih, {name}. Anda tidak boleh mengundi lagi.</p>
      <VoterLogout />
    </section>
  );
}

export function BallotFlow({ name, positions }: { name: string; positions: BallotPosition[] }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [limits, setLimits] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<"ballot" | "review" | "done">("ballot");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);

  useEffect(() => {
    function clearSelections() {
      flushSync(() => {
        setPicks({});
        setLimits({});
        setError("");
        setStep("ballot");
      });
    }
    window.addEventListener("pagehide", clearSelections);
    return () => window.removeEventListener("pagehide", clearSelections);
  }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => { if (error) errorNotice.current?.focus(); }, [error]);

  function pick(position: BallotPosition, candidateId: string, checked: boolean) {
    const selected = picks[position.id] ?? [];
    if (position.maxChoices === 1) {
      setPicks({ ...picks, [position.id]: candidateId ? [candidateId] : [] });
    } else if (checked && selected.length >= position.maxChoices) {
      setLimits({ ...limits, [position.id]: true });
    } else {
      setPicks({ ...picks, [position.id]: checked ? [...selected, candidateId] : selected.filter(id => id !== candidateId) });
      setLimits({ ...limits, [position.id]: false });
    }
  }

  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError("");
    const selection: Selection = Object.entries(picks).map(([positionId, candidateIds]) => ({ positionId, candidateIds }));
    try {
      const response = await fetch("/vote/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection), cache: "no-store",
      });
      const result = await response.json();
      if (response.ok && result.ok) {
        setPicks({});
        setStep("done");
        router.refresh();
      } else {
        setError(result.error ?? "Undi tidak dapat dihantar.");
      }
    } catch {
      setError("Sambungan gagal. Muat semula untuk menyemak status undi anda.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  if (step === "done") return <VoteConfirmation name={name} />;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-bold">
          {step === "ballot" ? `Selamat datang, ${name}` : "Semak undi anda"}
        </h2>
        <VoterLogout />
      </div>
      {step === "ballot" ? (
        <>
          <p className="mut mb-4">Pilih calon anda. Anda hanya boleh mengundi sekali.</p>
          {positions.map(position => {
            const selected = picks[position.id] ?? [];
            const single = position.maxChoices === 1;
            return (
              <fieldset className="card min-w-0" key={position.id} aria-describedby={`hint-${position.id}`}>
                <legend className="px-1 font-bold">{position.title}</legend>
                <p className="mut" id={`hint-${position.id}`}>
                  {single ? "Pilih seorang" : `Pilih sehingga ${position.maxChoices} orang`}. Biarkan kosong jika tidak mahu mengundi.
                </p>
                {position.candidates.map(candidate => (
                  <label className="vote-option" key={candidate.id}>
                    <input type={single ? "radio" : "checkbox"} name={position.id} checked={selected.includes(candidate.id)}
                      onChange={event => pick(position, candidate.id, event.target.checked)} />
                    {candidate.photoPath
                      ? <Image src={candidate.photoPath} alt={`Foto ${candidate.name}`} width={56} height={56} unoptimized
                        className="h-14 w-14 shrink-0 rounded-full object-cover" />
                      : <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--soft)] font-bold text-[var(--mut)]">
                        {candidate.name.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join("")}
                      </span>}
                    <span className="min-w-0 wrap-anywhere"><b>{candidate.name}</b><br /><span className="mut">{candidate.bio}</span></span>
                  </label>
                ))}
                {single && <label className="vote-option">
                  <input type="radio" name={position.id} checked={selected.length === 0}
                    onChange={() => pick(position, "", true)} />
                  <span>Tidak mengundi untuk jawatan ini</span>
                </label>}
                {limits[position.id] && <p role="alert" className="form-error mt-2">
                  Anda hanya boleh pilih {position.maxChoices} orang untuk jawatan ini.
                </p>}
              </fieldset>
            );
          })}
          <button className="btn" type="button" onClick={() => setStep("review")}>Semak undi saya</button>
        </>
      ) : (
        <>
          {positions.map(position => {
            const selected = picks[position.id] ?? [];
            const names = position.candidates.filter(candidate => selected.includes(candidate.id)).map(candidate => candidate.name);
            return (
              <div className="card" key={position.id}>
                <h3 className="font-bold">{position.title}</h3>
                <p className={names.length ? "wrap-anywhere" : "mut"}>{names.join(", ") || "Tidak mengundi"}</p>
              </div>
            );
          })}
          <p className="mut mb-3">Selepas dihantar, undi tidak boleh diubah.</p>
          {error && <p ref={errorNotice} tabIndex={-1} role="alert" className="form-error mb-3">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="ghost" type="button" disabled={pending} onClick={() => { setError(""); setStep("ballot"); }}>Kembali ubah</button>
            <button className="btn" type="button" disabled={pending} onClick={() => void submit()}>
              {pending ? "Menghantar…" : "Hantar undi"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
