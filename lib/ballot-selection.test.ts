import { describe, expect, it } from "vitest";
import { validateSelection } from "./ballot-selection";

const positions = [
  { id: "chair", maxChoices: 1, candidates: [{ id: "c1" }, { id: "c2" }] },
  { id: "board", maxChoices: 2, candidates: [{ id: "b1" }, { id: "b2" }] },
];

describe("ballot selection", () => {
  it("accepts omitted positions, empty selections and multi-seat choices", () => {
    expect(validateSelection([], positions)).toBe(true);
    expect(validateSelection([{ positionId: "chair", candidateIds: [] }, { positionId: "board", candidateIds: ["b1", "b2"] }], positions)).toBe(true);
  });

  it.each([
    [{ positionId: "chair", candidateIds: ["c1", "c2"] }],
    [{ positionId: "board", candidateIds: ["b1", "b1"] }],
    [{ positionId: "chair", candidateIds: ["b1"] }],
    [{ positionId: "unknown", candidateIds: [] }],
    [{ positionId: "chair", candidateIds: ["c1"] }, { positionId: "chair", candidateIds: ["c2"] }],
  ].map(selection => [selection]))("rejects out-of-bounds or duplicate selections", (selection) => {
    expect(validateSelection(selection, positions)).toBe(false);
  });
});
