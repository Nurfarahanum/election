import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");

describe("anonymous ballot schema", () => {
  it.each([
    ["Ballot", ["id", "electionId", "election", "choices"]],
    ["BallotChoice", ["id", "ballotId", "positionId", "candidateId", "ballot", "position", "candidate"]],
  ])("keeps %s limited to ballot data", (model, expected) => {
    const body = schema.match(new RegExp(`model ${model} \\{([^}]+)\\}`))?.[1] ?? "";
    const fields = body.split("\n").map((line) => line.trim()).filter((line) => /^\w+\s/.test(line));
    expect(fields.map((field) => field.split(/\s+/)[0])).toEqual(expected);
    expect(fields[0]).toContain("@default(uuid())");
  });
});
