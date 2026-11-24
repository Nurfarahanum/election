import type { ElectionStatus } from "@prisma/client";
import { validateSelection, type Selection } from "./ballot-selection";
import { prisma } from "./db";
import { effectiveStatus } from "./election";
import { credentialFingerprint } from "./voter-auth";

type LockedBallot = {
  electionId: string; status: ElectionStatus; startsAt: Date | null; endsAt: Date | null;
  voterId: string; hasVoted: boolean; keyHash: string; credentialFingerprint: string;
  positions: { id: string; maxChoices: number; candidates: { id: string }[] }[];
};

export async function submitBallot(sessionId: string, selection: Selection) {
  return prisma.$transaction(async (tx) => {
    // Concurrent voters share the election lock. Administrative changes take it exclusively.
    const [voter] = await tx.$queryRaw<LockedBallot[]>`
      SELECT e.id AS "electionId", e.status, e."startsAt", e."endsAt", v.id AS "voterId", v."hasVoted",
             v."keyHash", s."credentialFingerprint",
             COALESCE((
               SELECT json_agg(json_build_object('id', p.id, 'maxChoices', p."maxChoices", 'candidates',
                 COALESCE((SELECT json_agg(json_build_object('id', c.id))
                           FROM "Candidate" c WHERE c."positionId" = p.id), '[]'::json)))
               FROM "Position" p WHERE p."electionId" = e.id
             ), '[]'::json) AS positions
      FROM "VoterSession" s JOIN "Voter" v ON v.id = s."voterId"
      JOIN "Election" e ON e.id = v."electionId"
      WHERE s.id = ${sessionId}::uuid AND s."expiresAt" > clock_timestamp()
      FOR SHARE OF e
    `;
    if (!voter || voter.credentialFingerprint !== credentialFingerprint(voter.keyHash)) return "session" as const;
    if (voter.hasVoted) return "voted" as const;
    if (effectiveStatus(voter) !== "OPEN") return "closed" as const;

    if (!validateSelection(selection, voter.positions)) return "invalid" as const;

    const choices = selection.flatMap(({ positionId, candidateIds }) =>
      candidateIds.map(candidateId => ({ positionId, candidateId })),
    );

    // Each insert depends on the conditional voter update. No voter data is copied to the ballot.
    const updated = await tx.$executeRaw`
      WITH accepted AS (
        UPDATE "Voter" SET "hasVoted" = true, "votedAt" = NOW()
        WHERE id = ${voter.voterId}::uuid AND NOT "hasVoted" AND "keyHash" = ${voter.keyHash}
          AND (${voter.endsAt}::timestamptz IS NULL OR clock_timestamp() < ${voter.endsAt}::timestamptz)
          AND EXISTS (
            SELECT 1 FROM "VoterSession" WHERE id = ${sessionId}::uuid AND "expiresAt" > clock_timestamp()
          )
        RETURNING code
      ), ballot AS (
        INSERT INTO "Ballot" (id, "electionId") SELECT gen_random_uuid(), ${voter.electionId}::uuid FROM accepted
        RETURNING id
      ), ballot_choices AS (
        INSERT INTO "BallotChoice" (id, "ballotId", "positionId", "candidateId")
        SELECT gen_random_uuid(), ballot.id, selection."positionId", selection."candidateId"
        FROM ballot CROSS JOIN jsonb_to_recordset(${JSON.stringify(choices)}::jsonb) AS selection("positionId" uuid, "candidateId" uuid)
      )
      INSERT INTO "AuditLog" (id, "electionId", at, actor, action, detail)
      SELECT gen_random_uuid(), ${voter.electionId}::uuid, NOW(), 'VOTER:' || code, 'VOTE_SUBMITTED', '{}'::jsonb
      FROM accepted
    `;
    if (updated) return "ok" as const;

    const current = await tx.voter.findUnique({ where: { id: voter.voterId }, select: { hasVoted: true, keyHash: true } });
    if (current?.hasVoted) return "voted" as const;
    if (!current || current.keyHash !== voter.keyHash || effectiveStatus(voter) === "OPEN") return "session" as const;
    return "closed" as const;
  }, { maxWait: 5000, timeout: 15000 });
}
