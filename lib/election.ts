import type { ElectionStatus } from "@prisma/client";

type Schedule = { status: ElectionStatus; startsAt: Date | null; endsAt: Date | null };

export function effectiveStatus(election: Schedule, now = new Date()): ElectionStatus {
  const { status, startsAt, endsAt } = election;
  if (status !== "OPEN" && status !== "SCHEDULED") return status;
  if (endsAt && now >= endsAt) return "CLOSED";
  if (status === "SCHEDULED" && (!startsAt || now < startsAt)) return "SCHEDULED";
  return "OPEN";
}

export function ballotLocked(election: Schedule, ballotCount: number, now = new Date()) {
  const status = effectiveStatus(election, now);
  return status === "OPEN" || status === "CLOSED" || ballotCount > 0;
}

export const electionLabels = {
  DRAFT: "Draf", SCHEDULED: "Dijadualkan", OPEN: "Sedang dibuka", CLOSED: "Ditutup",
} satisfies Record<ElectionStatus, string>;

export function electionControls(election: Schedule, ballotCount: number, now = new Date()) {
  const status = effectiveStatus(election, now);
  return {
    status,
    canSchedule: status === "DRAFT" || status === "SCHEDULED",
    canOpen: status === "DRAFT" || status === "SCHEDULED",
    canClose: status === "OPEN",
    canReset: status !== "DRAFT" && ballotCount === 0,
  };
}
