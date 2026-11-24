import type { BallotPosition } from "./ballot-selection";
import { prisma } from "./db";

const ballotReads = new Map<string, Promise<BallotPosition[]>>();

export function voterBallot(electionId: string) {
  const existing = ballotReads.get(electionId);
  if (existing) return existing;

  const reading = prisma.position.findMany({
    where: { electionId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, title: true, maxChoices: true,
      candidates: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, bio: true, photoPath: true } },
    },
  }).finally(() => ballotReads.delete(electionId));
  ballotReads.set(electionId, reading);
  return reading;
}
