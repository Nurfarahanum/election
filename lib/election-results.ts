import { prisma } from "./db";
import { effectiveStatus } from "./election";
import { tallyResults } from "./tally";

export async function electionResults(electionId: string, audience: "admin" | "voter") {
  return prisma.$transaction(async tx => {
    const election = await tx.election.findUniqueOrThrow({
      where: { id: electionId },
      select: { status: true, startsAt: true, endsAt: true, hideLiveResults: true, resultsPublished: true },
    });
    const status = effectiveStatus(election);
    if (audience === "voter" && (status !== "CLOSED" || !election.resultsPublished)) return null;
    const [eligible, voted] = await Promise.all([
      tx.voter.count({ where: { electionId } }),
      tx.voter.count({ where: { electionId, hasVoted: true } }),
    ]);
    const turnout = { eligible, voted, percent: eligible ? Math.round(voted * 100 / eligible) : 0 };
    const shared = { turnout, status, hideLiveResults: election.hideLiveResults, resultsPublished: election.resultsPublished };
    if (status !== "CLOSED" && election.hideLiveResults) return { ...shared, results: null };

    const positions = await tx.position.findMany({
      where: { electionId }, orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, maxChoices: true, candidates: {
        orderBy: { sortOrder: "asc" }, select: { id: true, name: true },
      } },
    });
    const total = await tx.ballot.count({ where: { electionId } });
    const counts = await tx.ballotChoice.groupBy({
      by: ["candidateId"], where: { ballot: { electionId } }, _count: { _all: true },
    });
    const participation = await tx.$queryRaw<{ positionId: string; ballots: bigint }[]>`
      SELECT c."positionId", count(DISTINCT c."ballotId") AS ballots
      FROM "BallotChoice" c JOIN "Ballot" b ON b.id = c."ballotId"
      WHERE b."electionId" = ${electionId}::uuid
      GROUP BY c."positionId"
    `;
    return {
      ...shared,
      results: tallyResults(positions, total, counts.map(row => ({ candidateId: row.candidateId, votes: row._count._all })),
        participation.map(row => ({ positionId: row.positionId, ballots: Number(row.ballots) }))),
    };
  }, { isolationLevel: "RepeatableRead" });
}
