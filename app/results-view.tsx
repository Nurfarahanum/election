import type { tallyResults } from "../lib/tally";

export function Turnout({ turnout }: { turnout: { eligible: number; voted: number; percent: number } }) {
  return (
    <section className="card" aria-labelledby="turnout-heading">
      <h2 id="turnout-heading" className="font-bold">Kehadiran mengundi</h2>
      <progress className="result-bar result-leading" max={100} value={turnout.percent} aria-labelledby="turnout-heading" />
      <p className="mut">{`${turnout.voted} daripada ${turnout.eligible} pengundi (${turnout.percent}%)`}</p>
    </section>
  );
}

export function ResultCounts({ results, admin = false }: { results: ReturnType<typeof tallyResults>; admin?: boolean }) {
  return results.map(position => {
    const maximum = Math.max(1, position.abstentions, ...position.candidates.map(candidate => candidate.votes));
    return (
      <section className="card" key={position.id}>
        <h2 className="font-bold">{position.title} <span className="chip">Pilih {position.maxChoices}</span></h2>
        {position.candidates.map(candidate => (
          <div className="mt-2" key={candidate.id}>
            <div className="flex flex-wrap justify-between gap-x-3">
              <b className="min-w-0 wrap-anywhere">{candidate.name}</b>
              <span>
                {candidate.votes} undi
                {candidate.leading && <span className="font-semibold text-[var(--ok)]"> · mendahului</span>}
                {admin && candidate.tied && <span className="font-semibold text-[var(--bad)]">
                  {candidate.cutoffTie ? " · seri pada ambang pemilihan" : " · seri"}
                </span>}
              </span>
            </div>
            <progress className={`result-bar${candidate.leading ? " result-leading" : ""}`}
              aria-label={`Undi untuk ${candidate.name}`} max={maximum} value={candidate.votes} />
          </div>
        ))}
        <p className="mut mt-2">Tidak mengundi untuk jawatan ini: {position.abstentions}</p>
      </section>
    );
  });
}
