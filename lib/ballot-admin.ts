import type { Election, Prisma } from "@prisma/client";
import { z } from "zod";
import { AdminInputError, auditAdmin } from "./admin-election";
import { ballotLocked } from "./election";

const id = z.uuid();
const title = z.string().trim().min(1).max(120);
const maxChoices = z.coerce.number().int().min(1).max(2147483647);
const name = z.string().trim().min(1).max(120);
const bio = z.string().trim().max(1000);

export const ballotCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("election-update"), name: title, orgName: title }),
  z.object({ action: z.literal("position-add"), title, maxChoices }),
  z.object({ action: z.literal("position-update"), positionId: id, title, maxChoices }),
  z.object({ action: z.literal("position-remove"), positionId: id }),
  z.object({ action: z.literal("candidate-add"), positionId: id, name, bio }),
  z.object({ action: z.literal("candidate-update"), candidateId: id, name, bio }),
  z.object({ action: z.literal("candidate-remove"), candidateId: id }),
  z.object({ action: z.literal("candidate-photo-remove"), candidateId: id }),
]);

export async function editBallot(
  tx: Prisma.TransactionClient, election: Election, adminId: string,
  command: z.infer<typeof ballotCommand>, photo: string | null,
): Promise<string[]> {
  if (command.action !== "election-update" && ballotLocked(election, await tx.ballot.count({ where: { electionId: election.id } }))) {
    throw new AdminInputError("Ballot dikunci kerana undian sudah dibuka atau ada undi masuk.", 409);
  }

  let detail: Prisma.InputJsonObject;
  let unusedPhotos: string[] = [];
  if (command.action === "election-update") {
    const { name, orgName } = command;
    await tx.election.update({ where: { id: election.id }, data: { name, orgName } });
    detail = { name, orgName };
  } else if (command.action === "position-add") {
    const { title, maxChoices } = command;
    const order = await tx.position.aggregate({ where: { electionId: election.id }, _max: { sortOrder: true } });
    const position = await tx.position.create({
      data: { electionId: election.id, title, maxChoices, sortOrder: (order._max.sortOrder ?? -1) + 1 },
    });
    detail = { positionId: position.id, title, maxChoices };
  } else if ("positionId" in command) {
    const position = await tx.position.findFirst({
      where: { id: command.positionId, electionId: election.id },
      include: { candidates: { select: { photoPath: true, sortOrder: true } } },
    });
    if (!position) throw new AdminInputError("Jawatan tidak ditemui.", 404);
    detail = { positionId: position.id };
    if (command.action === "position-update") {
      const { title, maxChoices } = command;
      await tx.position.update({ where: { id: position.id }, data: { title, maxChoices } });
      detail = { ...detail, title, maxChoices };
    } else if (command.action === "position-remove") {
      await tx.position.delete({ where: { id: position.id } });
      unusedPhotos = position.candidates.flatMap(({ photoPath }) => photoPath ? [photoPath] : []);
    } else {
      const sortOrder = Math.max(-1, ...position.candidates.map((candidate) => candidate.sortOrder)) + 1;
      const { name, bio } = command;
      const candidate = await tx.candidate.create({
        data: { positionId: position.id, name, bio, sortOrder, photoPath: photo },
      });
      detail = { ...detail, candidateId: candidate.id, name, photo: Boolean(photo) };
    }
  } else {
    const candidate = await tx.candidate.findFirst({
      where: { id: command.candidateId, position: { electionId: election.id } },
    });
    if (!candidate) throw new AdminInputError("Calon tidak ditemui.", 404);
    detail = { candidateId: candidate.id };
    if (command.action === "candidate-update") {
      const { name, bio } = command;
      const photoPath = photo ?? candidate.photoPath;
      await tx.candidate.update({ where: { id: candidate.id }, data: { name, bio, photoPath } });
      detail = { ...detail, name, photo: Boolean(photo) };
    } else if (command.action === "candidate-remove") {
      await tx.candidate.delete({ where: { id: candidate.id } });
    } else {
      await tx.candidate.update({ where: { id: candidate.id }, data: { photoPath: null } });
    }
    if (candidate.photoPath && (command.action !== "candidate-update" || photo)) unusedPhotos = [candidate.photoPath];
  }
  await auditAdmin(tx, election.id, adminId, command.action.toUpperCase().replaceAll("-", "_"), detail);
  return unusedPhotos;
}
