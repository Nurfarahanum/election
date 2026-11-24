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
  const status = await startVoterSession(code.data ?? "", key.success ? key.data : "!", requestIp(request));
  return redirectAfterPost(status === "ok" ? "/vote" : `/vote?ralat=${status}`);
}
