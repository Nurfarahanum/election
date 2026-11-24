import { describe, expect, it } from "vitest";
import { ballotLocked, effectiveStatus } from "./election";

describe("ballot structure lock", () => {
  const startsAt = new Date("2026-11-24T01:00:00Z");
  const endsAt = new Date("2026-11-24T03:00:00Z");
  const scheduled = { status: "SCHEDULED", startsAt, endsAt } as const;

  it("locks at the scheduled start and stays locked through the end", () => {
    expect(ballotLocked(scheduled, 0, new Date(startsAt.getTime() - 1))).toBe(false);
    expect(effectiveStatus(scheduled, startsAt)).toBe("OPEN");
    expect(ballotLocked(scheduled, 0, startsAt)).toBe(true);
    expect(effectiveStatus(scheduled, endsAt)).toBe("CLOSED");
    expect(ballotLocked(scheduled, 0, endsAt)).toBe(true);
  });

  it("locks if a ballot exists even when the stored state is draft", () => {
    expect(ballotLocked({ ...scheduled, status: "DRAFT" }, 1)).toBe(true);
  });
});
