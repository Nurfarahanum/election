import { voterBallot } from "../../../lib/voter-view";
import { voterLoginErrors } from "../voter-copy";
import { acceptsOrigin, redirectAfterPost, requestIp } from "../../../lib/request-security";
import { startVoterSession, voterCode, voterKey } from "../../../lib/voter-auth";

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    return new Response(null, { status: 415 });
  }
  const data = await request.formData();
  const code = voterCode.safeParse(data.get("code"));
  const key = voterKey.safeParse(data.get("key"));
  const result = await startVoterSession(code.data ?? "", key.success ? key.data : "!", requestIp(request));
  if (request.headers.get("accept") !== "application/json") {
    return redirectAfterPost(result.status === "ok" ? "/vote" : `/vote?ralat=${result.status}`);
  }
  const headers = { "Cache-Control": "private, no-store" };
  if (result.status !== "ok") {
    return Response.json({ error: voterLoginErrors[result.status] }, { status: 403, headers });
  }
  if (result.electionStatus !== "OPEN") return Response.json({ destination: "results" }, { headers });
  const positions = await voterBallot(result.electionId);
  return Response.json({ name: result.name, positions }, { headers });
}
