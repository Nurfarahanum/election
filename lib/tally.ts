export type TallyPosition = { id: string; title: string; maxChoices: number; candidates: { id: string; name: string }[] };

export function tallyResults(
  positions: TallyPosition[], totalBallots: number,
  counts: { candidateId: string; votes: number }[], participation: { positionId: string; ballots: number }[],
) {
  const byCandidate = new Map(counts.map(row => [row.candidateId, row.votes]));
  const byPosition = new Map(participation.map(row => [row.positionId, row.ballots]));

  return positions.map(position => {
    const candidates = position.candidates.map(candidate => ({ ...candidate, votes: byCandidate.get(candidate.id) ?? 0 }));
    const ranked = candidates.map(candidate => candidate.votes).filter(votes => votes > 0).sort((a, b) => b - a);
    const cutoff = ranked[position.maxChoices - 1];
    const frequencies = new Map<number, number>();
    for (const votes of ranked) frequencies.set(votes, (frequencies.get(votes) ?? 0) + 1);
    return {
      ...position,
      abstentions: totalBallots - (byPosition.get(position.id) ?? 0),
      candidates: candidates.map(candidate => ({
        ...candidate,
        leading: candidate.votes > 0 && (cutoff === undefined || candidate.votes >= cutoff),
        tied: (frequencies.get(candidate.votes) ?? 0) > 1,
        cutoffTie: cutoff !== undefined && candidate.votes === cutoff && ranked[position.maxChoices] === cutoff,
      })),
    };
  });
}
