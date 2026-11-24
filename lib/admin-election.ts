import type { Election, Prisma } from "@prisma/client";
import { prisma } from "./db";

export class AdminInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const electionOrder = [{ createdAt: "desc" }, { id: "desc" }] as const;

export function activeElection(db: Prisma.TransactionClient = prisma) {
  return db.election.findFirst({ orderBy: [...electionOrder] });
}

export async function withElectionLock<T>(
  id: string, run: (tx: Prisma.TransactionClient, election: Election) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    // Election state changes and ballot structure edits share this row lock.
    const [election] = await tx.$queryRaw<Election[]>`
      SELECT * FROM "Election" WHERE "id" = ${id}::uuid FOR UPDATE
    `;
    if (!election) throw new AdminInputError("Pilihan raya tidak ditemui.", 404);
    return run(tx, election);
  }, { maxWait: 5000, timeout: 15000 });
}

export async function auditAdmin(
  tx: Prisma.TransactionClient, electionId: string, adminId: string, action: string, detail: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({ data: { electionId, actor: `ADMIN:${adminId}`, action, detail } });
}
