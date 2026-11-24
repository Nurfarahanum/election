import { acceptsOrigin, redirectAfterPost } from "../../../lib/request-security";
import { endVoterSession } from "../../../lib/voter-auth";

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  await endVoterSession();
  return redirectAfterPost("/vote");
}
