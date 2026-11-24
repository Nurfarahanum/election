import { z } from "zod";
import { acceptsOrigin, currentAdmin } from "../../../lib/admin-auth";
import { activeElection, AdminInputError, withElectionLock } from "../../../lib/admin-election";
import { ballotCommand, clearUnusedPhotos, editBallot } from "../../../lib/ballot-admin";
import { preparePhoto } from "../../../lib/candidate-photo";
import { prisma } from "../../../lib/db";
import { addVoters, prepareVoters, registeredVoters, updateVoter, voterCommand } from "../../../lib/voter-admin";
import { parseImport, validateImport } from "../../../lib/voter-import";
import { issueVoterKey } from "../../../lib/voter-keys";

const target = z.object({ electionId: z.uuid(), action: z.string().min(1).max(40) });
const fileSchema = z.file();
const noStore = { "Cache-Control": "private, no-store" };

function json(data: object, status = 200) {
  return Response.json(data, { status, headers: noStore });
}

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return json({ error: "Permintaan tidak dibenarkan." }, 403);
  const admin = await currentAdmin();
  if (!admin) return json({ error: "Sesi tamat. Sila log masuk semula." }, 401);

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return json({ error: "Borang tidak dapat dibaca." }, 400);
  }
  const fields = Object.fromEntries(data);
  const input = target.safeParse(fields);
  if (!input.success) return json({ error: "Borang tidak sah." }, 400);

  try {
    const election = await activeElection();
    if (!election || election.id !== input.data.electionId) {
      throw new AdminInputError("Pilihan raya aktif telah berubah. Muat semula halaman.", 409);
    }

    const { action } = input.data;
    if (action === "import-preview" || action === "import-commit") {
      const file = fileSchema.safeParse(fields.file);
      if (!file.success) throw new AdminInputError("Pilih fail import.");
      const rows = validateImport(await parseImport(file.data), await registeredVoters(prisma, election.id));
      const hasErrors = rows.some((row) => row.errors.length);
      if (action === "import-preview" || hasErrors) return json({ rows }, action === "import-commit" ? 422 : 200);
      const prepared = await prepareVoters(rows);
      const keys = await withElectionLock(election.id, (tx) => addVoters(tx, election.id, admin.id, prepared, true));
      return json({ keys, message: `${keys.length} pengundi diimport.` });
    }

    const voter = voterCommand.safeParse(fields);
    if (voter.success) {
      const command = voter.data;
      if (command.action === "voter-add") {
        const row = validateImport([{ ...command, row: 1 }], await registeredVoters(prisma, election.id))[0];
        if (row.errors.length) throw new AdminInputError(row.errors.join(" "));
        const prepared = await prepareVoters([command]);
        const keys = await withElectionLock(election.id, (tx) => addVoters(tx, election.id, admin.id, prepared, false));
        return json({ keys, message: "Pengundi ditambah." });
      }
      const regenerated = command.action === "voter-regenerate" ? await issueVoterKey() : null;
      const keys = await withElectionLock(election.id, (tx) => updateVoter(tx, election.id, admin.id, command.voterId, regenerated));
      return json({ keys, message: regenerated ? "Kunci baharu dijana." : "Pengundi dibuang." });
    }

    const ballot = ballotCommand.safeParse(fields);
    if (!ballot.success) throw new AdminInputError("Semak maklumat yang diisi dan cuba lagi.");
    const upload = fileSchema.safeParse(fields.photo);
    const acceptsPhoto = ballot.data.action === "candidate-add" || ballot.data.action === "candidate-update";
    const photo = acceptsPhoto && upload.success && upload.data.name ? await preparePhoto(upload.data) : null;
    const oldPhotos = await withElectionLock(election.id, (tx, lockedElection) =>
      editBallot(tx, lockedElection, admin.id, ballot.data, photo));
    await clearUnusedPhotos(oldPhotos);
    return json({ message: "Perubahan disimpan." });
  } catch (error) {
    if (error instanceof AdminInputError) return json({ error: error.message }, error.status);
    console.error("Admin management request failed.", error instanceof Error ? error.name : "Unknown error");
    return json({ error: "Perubahan tidak dapat diselesaikan. Semak halaman sebelum mencuba lagi." }, 500);
  }
}
