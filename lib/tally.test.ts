import { describe, expect, it } from "vitest";
import { tallyResults } from "./tally";

const board = {
  id: "board", title: "Ahli Lembaga", maxChoices: 2,
  candidates: ["a", "b", "c", "d"].map(id => ({ id, name: id })),
};

describe("result tally", () => {
  it("counts abstention per ballot and flags a tie that crosses the seat cutoff", () => {
    const [result] = tallyResults([board], 5, [
      { candidateId: "a", votes: 3 }, { candidateId: "b", votes: 2 }, { candidateId: "c", votes: 2 },
    ], [{ positionId: "board", ballots: 4 }]);
    expect(result.abstentions).toBe(1);
    expect(result.candidates.map(({ leading, tied, cutoffTie }) => [leading, tied, cutoffTie])).toEqual([
      [true, false, false], [true, true, true], [true, true, true], [false, false, false],
    ]);
  });

  it("shows all ballots as abstentions when nobody makes a choice", () => {
    const [result] = tallyResults([board], 3, [], []);
    expect(result.abstentions).toBe(3);
    expect(result.candidates.every(candidate => !candidate.leading && !candidate.tied)).toBe(true);
  });

  it("marks every positive candidate as leading when fewer candidates receive votes than seats", () => {
    const [result] = tallyResults([board], 1, [{ candidateId: "b", votes: 1 }], [{ positionId: "board", ballots: 1 }]);
    expect(result.candidates.filter(candidate => candidate.leading).map(candidate => candidate.id)).toEqual(["b"]);
  });
});
