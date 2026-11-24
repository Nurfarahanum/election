import { acceptsOrigin, adminRedirect, endAdminSession } from "../../../lib/admin-auth";

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  await endAdminSession();
  return adminRedirect("/admin/login");
}
