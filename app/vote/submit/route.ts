import { selectionSchema } from "../../../lib/ballot-selection";
import { acceptsOrigin } from "../../../lib/request-security";
import { submitBallot } from "../../../lib/submit-ballot";
import { voterSessionId } from "../../../lib/voter-auth";

function json(data: object, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return json({ error: "Permintaan tidak dibenarkan." }, 403);
  const session = await voterSessionId();
  if (!session) return json({ error: "Sesi tamat. Sila log masuk semula." }, 401);
  const payload = await request.json().catch(() => null);
  const input = selectionSchema.safeParse(payload);
  if (!input.success) return json({ error: "Pilihan undi tidak sah." }, 400);

  const result = await submitBallot(session, input.data);
  switch (result) {
    case "ok": return json({ ok: true });
    case "voted": return json({ error: "Anda sudah mengundi." }, 409);
    case "closed": return json({ error: "Pengundian tidak dibuka." }, 409);
    case "invalid": return json({ error: "Pilihan undi tidak sah." }, 400);
    case "session": return json({ error: "Sesi tamat. Sila log masuk semula." }, 401);
  }
}
