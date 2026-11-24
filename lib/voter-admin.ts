import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { AdminInputError, auditAdmin } from "./admin-election";
import { validateImport, voterFields, type VoterFields } from "./voter-import";
import { issueVoterKey } from "./voter-keys";

export type IssuedKey = { code: string; name: string; key: string };
export const voterCommand = z.discriminatedUnion("action", [
  voterFields.extend({ action: z.literal("voter-add") }),
  z.object({ action: z.literal("voter-remove"), voterId: z.uuid() }),
  z.object({ action: z.literal("voter-regenerate"), voterId: z.uuid() }),
]);

export const registeredVoters = (tx: Prisma.TransactionClient, electionId: string) =>
  tx.voter.findMany({ where: { electionId }, select: { code: true, name: true, email: true } });

export async function prepareVoters(voters: VoterFields[]) {
  const prepared = [];
  for (const voter of voters) {
    prepared.push({ ...voter, ...await issueVoterKey() });
  }
  return prepared;
}

export async function addVoters(
  tx: Prisma.TransactionClient, electionId: string, adminId: string,
  prepared: Awaited<ReturnType<typeof prepareVoters>>, importing: boolean,
) {
  const existing = await registeredVoters(tx, electionId);
  const rows = validateImport(prepared.map(({ name, email }, index) => ({ row: index + 1, name, email })), existing);
  if (rows.some((row) => row.errors.length)) {
    throw new AdminInputError("Senarai bertindih dengan pengundi sedia ada. Semak semula pratonton.", 409);
  }

  const removals = await tx.auditLog.findMany({
    where: { electionId, action: "VOTER_REMOVE" }, select: { detail: true },
  });
  const codes = [
    ...existing.map(({ code }) => code),
    ...removals.map(({ detail }) => z.object({ code: z.string() }).safeParse(detail).data?.code ?? ""),
  ];
  const highest = codes.reduce((max, code) => {
    const match = /^KP-(\d+)$/.exec(code);
    const number = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(number) ? Math.max(max, number) : max;
  }, 0);
  const assigned = prepared.map((voter, index) => ({
    ...voter, code: `KP-${String(highest + index + 1).padStart(3, "0")}`,
  }));
  await tx.voter.createMany({
    data: assigned.map(({ code, name, email, keyHash }) => ({ electionId, code, name, email: email || null, keyHash })),
  });
  await auditAdmin(tx, electionId, adminId, importing ? "VOTERS_IMPORT" : "VOTER_ADD", {
    codes: assigned.map(({ code }) => code), count: assigned.length,
  });
  return assigned.map(({ code, name, key }) => ({ code, name, key }));
}

export async function updateVoter(
  tx: Prisma.TransactionClient, electionId: string, adminId: string,
  voterId: string, regenerated: Awaited<ReturnType<typeof issueVoterKey>> | null,
): Promise<IssuedKey[]> {
  const voter = await tx.voter.findFirst({
    where: { id: voterId, electionId }, select: { id: true, code: true, name: true },
  });
  if (!voter) throw new AdminInputError("Pengundi tidak ditemui.", 404);
  const where = { id: voter.id, hasVoted: false };
  const result = regenerated
    ? await tx.voter.updateMany({ where, data: { keyHash: regenerated.keyHash } })
    : await tx.voter.deleteMany({ where });
  if (!result.count) throw new AdminInputError("Pengundi ini sudah mengundi.", 409);
  await auditAdmin(tx, electionId, adminId, regenerated ? "VOTER_REGENERATE" : "VOTER_REMOVE", { code: voter.code });
  return regenerated ? [{ code: voter.code, name: voter.name, key: regenerated.key }] : [];
}
