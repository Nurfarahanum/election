import { z } from "zod";
import { currentAdmin } from "../../../lib/admin-auth";
import { activeElection, AdminInputError } from "../../../lib/admin-election";
import { download } from "../../../lib/downloads";
import { acceptsOrigin } from "../../../lib/request-security";
import { distributeMail, distributionCommand, prepareSlips } from "../../../lib/voter-distribution";

function json(data: object, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return json({ error: "Permintaan tidak dibenarkan." }, 403);
  const admin = await currentAdmin();
  if (!admin) return json({ error: "Sesi tamat. Sila log masuk semula." }, 401);
  const fields = await request.formData().then(Object.fromEntries).catch(() => ({}));
  const command = distributionCommand.safeParse(fields);
  const electionId = z.object({ electionId: z.uuid() }).safeParse(fields);
  if (!command.success || !electionId.success) return json({ error: "Borang tidak sah." }, 400);

  try {
    const election = await activeElection();
    if (!election || election.id !== electionId.data.electionId) {
      throw new AdminInputError("Pilihan raya aktif telah berubah. Muat semula halaman.", 409);
    }
    if (command.data.action === "slips") {
      const file = await prepareSlips(election, admin.id, command.data);
      return download("slip-pengundi.pdf", file, "application/pdf");
    }
    return json(await distributeMail(election, admin.id, command.data.action, command.data.voterId));
  } catch (error) {
    if (error instanceof AdminInputError) return json({ error: error.message }, error.status);
    console.error("Voter distribution failed.", error instanceof Error ? error.name : "Unknown error");
    return json({ error: "Tindakan gagal. Semak log audit sebelum mencuba lagi." }, 500);
  }
}
