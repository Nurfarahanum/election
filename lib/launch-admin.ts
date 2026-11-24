import type { Election, Prisma } from "@prisma/client";
import { z } from "zod";
import { AdminInputError, auditAdmin } from "./admin-election";
import { electionControls } from "./election";
import { parseScheduleValue } from "./malaysia-time";

const toggle = z.enum(["true", "false"]).transform(value => value === "true");
export const launchCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("election-schedule"), startsAt: z.string(), endsAt: z.string() }),
  z.object({ action: z.literal("election-open") }),
  z.object({ action: z.literal("election-close") }),
  z.object({ action: z.literal("election-draft") }),
  z.object({ action: z.literal("results-publish"), enabled: toggle }),
  z.object({ action: z.literal("results-visibility"), enabled: toggle }),
]);

export async function changeElection(
  tx: Prisma.TransactionClient, election: Election, adminId: string, command: z.infer<typeof launchCommand>,
) {
  const ballotCount = command.action === "election-draft"
    ? await tx.ballot.count({ where: { electionId: election.id } }) : 0;
  const now = new Date();
  const controls = electionControls(election, ballotCount, now);
  let data: Prisma.ElectionUpdateInput;
  let detail: Prisma.InputJsonObject = {};
  let message: string;

  function requireState(allowed: boolean) {
    if (!allowed) throw new AdminInputError("Tindakan ini tidak dibenarkan untuk status pilihan raya semasa.", 409);
  }

  switch (command.action) {
    case "election-schedule": {
      requireState(controls.canSchedule);
      const startsAt = parseScheduleValue(command.startsAt);
      const endsAt = parseScheduleValue(command.endsAt);
      if (!startsAt || !endsAt || endsAt <= startsAt) {
        throw new AdminInputError("Masa tamat mesti selepas masa mula. Gunakan Waktu Malaysia.");
      }
      data = { status: "SCHEDULED", startsAt, endsAt, resultsPublished: false };
      detail = { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
      message = "Jadual disimpan.";
      break;
    }
    case "election-open":
      requireState(controls.canOpen);
      data = { status: "OPEN", startsAt: now, endsAt: election.endsAt, resultsPublished: false };
      message = "Undian dibuka.";
      break;
    case "election-close":
      requireState(controls.canClose);
      data = { status: "CLOSED", endsAt: now };
      message = "Undian ditutup.";
      break;
    case "election-draft":
      requireState(controls.canReset);
      data = { status: "DRAFT", startsAt: null, endsAt: null, resultsPublished: false };
      await tx.voterSession.deleteMany({ where: { voter: { electionId: election.id } } });
      message = "Pilihan raya dikembalikan ke draf.";
      break;
    case "results-publish":
      requireState(controls.status === "CLOSED");
      data = { resultsPublished: command.enabled };
      detail = { enabled: command.enabled };
      message = command.enabled ? "Keputusan diterbitkan." : "Penerbitan keputusan ditarik balik.";
      break;
    case "results-visibility":
      data = { hideLiveResults: command.enabled };
      detail = { hideLiveResults: command.enabled };
      message = "Tetapan paparan keputusan disimpan.";
      break;
  }

  await tx.election.update({ where: { id: election.id }, data });
  await auditAdmin(tx, election.id, adminId, command.action.toUpperCase().replaceAll("-", "_"), detail);
  return message;
}
