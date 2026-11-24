import { endAdminSession } from "../../../lib/admin-auth";

import { acceptsOrigin, redirectAfterPost } from "../../../lib/request-security";

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  await endAdminSession();
  return redirectAfterPost("/admin/login");
}
