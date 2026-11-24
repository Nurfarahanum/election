import { activeElection } from "../../lib/admin-election";
import { electionResults } from "../../lib/election-results";
import { RefreshData } from "../refresh-data";
import { ResultCounts, Turnout } from "../results-view";
import { voterBallot } from "../../lib/voter-view";
import { VoterSignIn } from "./sign-in";
import { voterLoginErrors } from "./voter-copy";
import { effectiveStatus } from "../../lib/election";
import { findVoterSession, voterSessionId } from "../../lib/voter-auth";
import { BallotFlow, VoteConfirmation, VoterLogout } from "./ballot-flow";

export default async function VotePage({ searchParams }: { searchParams: Promise<{ ralat?: string }> }) {
  const sessionId = await voterSessionId();
  const voter = sessionId ? await findVoterSession(sessionId) : null;

  if (!voter) {
    const election = await activeElection();
    const resultsAvailable = election && effectiveStatus(election) === "CLOSED" && election.resultsPublished;
    const { ralat } = await searchParams;
    const message = ralat && Object.hasOwn(voterLoginErrors, ralat) ? voterLoginErrors[ralat as keyof typeof voterLoginErrors] : null;
    return <VoterSignIn resultsAvailable={Boolean(resultsAvailable)} message={message} />;
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

  const positions = await voterBallot(voter.electionId);
  return <BallotFlow name={voter.name} positions={positions} />;
}
