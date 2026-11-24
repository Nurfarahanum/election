import { redirect } from "next/navigation";
import { currentAdmin } from "../../../lib/admin-auth";
import { activeElection } from "../../../lib/admin-election";
import { electionLabels } from "../../../lib/election";
import { electionResults } from "../../../lib/election-results";
import { RefreshData } from "../../refresh-data";
import { ResultCounts, Turnout } from "../../results-view";
import { AdminNav } from "../admin-nav";
import { BallotForm } from "../ballot-form";

export default async function ResultsPage() {
  if (!await currentAdmin()) redirect("/admin/login");
  const election = await activeElection();
  if (!election) return <p>Tiada pilihan raya.</p>;
  const view = await electionResults(election.id, "admin");
  if (!view) return null;

  return (
    <>
      <AdminNav current="/admin/results" />
      <RefreshData />
      <p className="mut mb-3">Status: {electionLabels[view.status]}</p>
      <Turnout turnout={view.turnout} />
      {view.results
        ? <>
          <div className="mb-3 flex flex-wrap gap-2">
            <a className="ghost inline-flex items-center" href="/admin/export/keputusan.csv" download>Muat turun keputusan (CSV)</a>
            <a className="ghost inline-flex items-center" href="/admin/export/keputusan.pdf" download>Muat turun keputusan (PDF)</a>
          </div>
          <ResultCounts results={view.results} admin />
        </>
        : <p className="card mut">Keputusan calon disembunyikan sehingga undian ditutup.</p>}
      <section className="card">
        <h2 className="font-bold">Paparan keputusan</h2>
        {view.status !== "CLOSED" && (
          <BallotForm electionId={election.id} action="results-visibility"
            label={view.hideLiveResults ? "Papar keputusan kepada admin sekarang" : "Sembunyikan keputusan sehingga undian ditutup"}>
            <input type="hidden" name="enabled" value={String(!view.hideLiveResults)} />
          </BallotForm>
        )}
        {view.status === "CLOSED" ? (
          <>
            <p className="mut mt-2">{view.resultsPublished ? "Keputusan diterbitkan kepada pengundi." : "Keputusan belum diterbitkan kepada pengundi."}</p>
            <BallotForm electionId={election.id} action="results-publish"
              label={view.resultsPublished ? "Tarik balik penerbitan" : "Terbitkan keputusan kepada pengundi"}
              confirmText={view.resultsPublished ? "Tarik balik penerbitan keputusan?" : "Terbitkan keputusan kepada semua pengundi berdaftar?"}>
              <input type="hidden" name="enabled" value={String(!view.resultsPublished)} />
            </BallotForm>
          </>
        ) : <p className="mut mt-2">Keputusan boleh diterbitkan selepas undian ditutup.</p>}
      </section>
    </>
  );
}
