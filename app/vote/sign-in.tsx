"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { BallotPosition } from "../../lib/ballot-selection";
import { BallotFlow } from "./ballot-flow";

type Ballot = { name: string; positions: BallotPosition[] };

export function VoterSignIn({ resultsAvailable, message }: { resultsAvailable: boolean; message: string | null }) {
  const router = useRouter();
  const [ballot, setBallot] = useState<Ballot>();
  const [error, setError] = useState(message);
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const body = new URLSearchParams();
    const values = new FormData(event.currentTarget);
    body.set("code", String(values.get("code") ?? ""));
    body.set("key", String(values.get("key") ?? ""));
    inFlight.current = true;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/vote/login", { method: "POST", headers: { Accept: "application/json" }, body });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Log masuk gagal. Cuba lagi.");
      } else if (result.destination === "results") {
        router.refresh();
      } else {
        setBallot({ name: result.name, positions: result.positions });
      }
    } catch {
      setError("Sambungan gagal. Cuba lagi.");
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }

  if (ballot) return <BallotFlow name={ballot.name} positions={ballot.positions} />;

  return (
    <section className="card mx-auto my-6 max-w-[420px]" aria-labelledby="vote-login">
      <h2 id="vote-login" className="text-lg font-bold">{resultsAvailable ? "Log masuk untuk melihat keputusan" : "Log masuk untuk mengundi"}</h2>
      <p className="mut mt-2">Masukkan ID Pengundi dan Kunci Pengundi yang anda terima.</p>
      {error && <p role="alert" className="form-error mt-2">{error}</p>}
      <form method="post" action="/vote/login" className="mt-3 grid gap-3" onSubmit={signIn}>
        <label className="grid gap-1">ID Pengundi
          <input name="code" autoComplete="username" autoCapitalize="characters" spellCheck={false}
            placeholder="cth. KP-001" maxLength={32} required />
        </label>
        <label className="grid gap-1">Kunci Pengundi
          <input name="key" type="password" autoComplete="current-password" maxLength={8} required />
        </label>
        <button className="btn" type="submit" disabled={working}>{working ? "Memproses…" : "Log masuk"}</button>
      </form>
      <Link href="/admin" className="mt-4 inline-block text-sm underline">Log masuk admin</Link>
    </section>
  );
}
