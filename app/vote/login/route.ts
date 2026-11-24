import { acceptsOrigin, redirectAfterPost, requestIp } from "../../../lib/request-security";
import { allowVoterIp, startVoterSession, voterCode, voterKey } from "../../../lib/voter-auth";

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") {
    return new Response(null, { status: 415 });
  }
  if (!await allowVoterIp(requestIp(request))) return redirectAfterPost("/vote?ralat=invalid");
  const data = await request.formData();
  const code = voterCode.safeParse(data.get("code"));
  if (!code.success) return redirectAfterPost("/vote?ralat=invalid");
  const key = voterKey.safeParse(data.get("key"));
  const status = await startVoterSession(code.data, key.success ? key.data : "!");
  return redirectAfterPost(status === "ok" ? "/vote" : `/vote?ralat=${status}`);
}
