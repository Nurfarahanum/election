import { z } from "zod";

export const selectionSchema = z.array(z.object({
  positionId: z.uuid(),
  candidateIds: z.array(z.uuid()),
}).strict());

export type Selection = z.infer<typeof selectionSchema>;
export type BallotPosition = {
  id: string;
  title: string;
  maxChoices: number;
  candidates: { id: string; name: string; bio: string; photoPath: string | null }[];
};

export function validateSelection(
  selection: Selection, positions: { id: string; maxChoices: number; candidates: { id: string }[] }[],
) {
  const byId = new Map(positions.map(position => [position.id, position]));
  const used = new Set<string>();
  for (const { positionId, candidateIds } of selection) {
    const position = byId.get(positionId);
    if (!position || used.has(positionId) || candidateIds.length > position.maxChoices) return false;
    used.add(positionId);
    const allowed = new Set(position.candidates.map(({ id }) => id));
    if (new Set(candidateIds).size !== candidateIds.length || candidateIds.some(id => !allowed.has(id))) return false;
  }
  return true;
}
