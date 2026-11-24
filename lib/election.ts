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
