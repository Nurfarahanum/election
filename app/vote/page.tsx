import Link from "next/link";
import { activeElection } from "../../lib/admin-election";
import { electionResults } from "../../lib/election-results";
import { RefreshData } from "../refresh-data";
import { ResultCounts, Turnout } from "../results-view";
import { prisma } from "../../lib/db";
import { effectiveStatus } from "../../lib/election";
import { findVoterSession, voterSessionId } from "../../lib/voter-auth";
import { BallotFlow, VoteConfirmation, VoterLogout } from "./ballot-flow";

const loginErrors = {
  invalid: "ID atau Kunci tidak sepadan",
  "not-open": "Undian belum dibuka.",
  closed: "Undian sudah ditutup.",
  voted: "Anda sudah mengundi.",
} as const;

export default async function VotePage({ searchParams }: { searchParams: Promise<{ ralat?: string }> }) {
  const sessionId = await voterSessionId();
  const voter = sessionId ? await findVoterSession(sessionId) : null;

  if (!voter) {
    const election = await activeElection();
    const resultsAvailable = election && effectiveStatus(election) === "CLOSED" && election.resultsPublished;
    const { ralat } = await searchParams;
    const message = ralat && Object.hasOwn(loginErrors, ralat) ? loginErrors[ralat as keyof typeof loginErrors] : null;
    return (
      <section className="card mx-auto my-6 max-w-[420px]" aria-labelledby="vote-login">
        <h2 id="vote-login" className="text-lg font-bold">{resultsAvailable ? "Log masuk untuk melihat keputusan" : "Log masuk untuk mengundi"}</h2>
        <p className="mut mt-2">Masukkan ID Pengundi dan Kunci Pengundi yang anda terima.</p>
        {message && <p role="alert" className="form-error mt-2">{message}</p>}
        <form method="post" action="/vote/login" className="mt-3 grid gap-3">
          <label className="grid gap-1">
            ID Pengundi
            <input name="code" autoComplete="username" autoCapitalize="characters" spellCheck={false}
              placeholder="cth. KP-001" maxLength={32} required />
          </label>
          <label className="grid gap-1">
            Kunci Pengundi
            <input name="key" type="password" autoComplete="current-password" maxLength={8} required />
          </label>
          <button className="btn" type="submit">Log masuk</button>
        </form>
        <Link href="/admin" className="mt-4 inline-block text-sm underline">Log masuk admin</Link>
      </section>
    );
  }

  const status = effectiveStatus(voter);
  const published = status === "CLOSED" && voter.resultsPublished
    ? await electionResults(voter.electionId, "voter") : null;
  if (voter.hasVoted || published?.results) {
    return (
      <>
        <RefreshData />
        {voter.hasVoted ? <VoteConfirmation name={voter.name} /> : <div className="mb-3"><VoterLogout /></div>}
        {published?.results && (
          <>
            <h2 className="mb-3 text-lg font-bold">Keputusan</h2>
            <Turnout turnout={published.turnout} />
            <ResultCounts results={published.results} />
          </>
        )}
      </>
    );
  }
  if (status !== "OPEN") {
    return (
      <section className="card mx-auto my-6 max-w-[420px]">
        <RefreshData />
        <h2 className="mb-3 text-lg font-bold">{status === "CLOSED" ? "Undian sudah ditutup." : "Undian belum dibuka."}</h2>
        <VoterLogout />
      </section>
    );
  }

  const positions = await prisma.position.findMany({
    where: { electionId: voter.electionId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, title: true, maxChoices: true,
      candidates: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, bio: true, photoPath: true } },
    },
  });

  return <BallotFlow name={voter.name} positions={positions} />;
}
