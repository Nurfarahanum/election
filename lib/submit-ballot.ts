import type { Election } from "@prisma/client";
import { validateSelection, type Selection } from "./ballot-selection";
import { prisma } from "./db";
import { effectiveStatus } from "./election";
import { findVoterSession } from "./voter-auth";

export async function submitBallot(sessionId: string, selection: Selection) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.voterSession.findUnique({
      where: { id: sessionId }, select: { voter: { select: { electionId: true } } },
    });
    if (!session) return "session" as const;

    // Concurrent voters can share the lock. Admin election changes take an exclusive lock.
    const [election] = await tx.$queryRaw<Election[]>`
      SELECT * FROM "Election" WHERE "id" = ${session.voter.electionId}::uuid FOR SHARE
    `;
    const voter = await findVoterSession(sessionId, tx);
    if (!voter || !election) return "session" as const;
    if (voter.hasVoted) return "voted" as const;
    if (effectiveStatus(election) !== "OPEN") return "closed" as const;

    const positions = await tx.position.findMany({
      where: { electionId: election.id },
      select: { id: true, maxChoices: true, candidates: { select: { id: true } } },
    });
    if (!validateSelection(selection, positions)) return "invalid" as const;

    const updated = await tx.$executeRaw`
      UPDATE "Voter"
      SET "hasVoted" = true, "votedAt" = NOW()
      WHERE "id" = ${voter.voterId}::uuid AND "hasVoted" = false
        AND (${election.endsAt}::timestamptz IS NULL OR clock_timestamp() < ${election.endsAt}::timestamptz)
    `;
    if (updated === 0) {
      const current = await tx.voter.findUnique({ where: { id: voter.voterId }, select: { hasVoted: true } });
      return current?.hasVoted ? "voted" as const : "closed" as const;
    }

    const ballot = await tx.ballot.create({ data: { electionId: election.id }, select: { id: true } });
    const choices = selection.flatMap(({ positionId, candidateIds }) =>
      candidateIds.map(candidateId => ({ ballotId: ballot.id, positionId, candidateId })),
    );
    if (choices.length) await tx.ballotChoice.createMany({ data: choices });
    await tx.auditLog.create({
      data: { electionId: election.id, actor: `VOTER:${voter.code}`, action: "VOTE_SUBMITTED", detail: {} },
    });
    return "ok" as const;
  }, { maxWait: 5000, timeout: 15000 });
}
