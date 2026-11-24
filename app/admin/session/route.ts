import { isIP } from "node:net";
import { z } from "zod";
import { emailSchema, passwordSchema } from "../../../lib/credentials";
import { acceptsOrigin, adminRedirect, allowLoginAttempt, startAdminSession, verifyAdmin } from "../../../lib/admin-auth";

const credentials = z.object({ email: emailSchema, password: passwordSchema });
const loginFailed = "/admin/login?ralat=1";

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") {
    return new Response(null, { status: 415 });
  }

  const client = request.headers.get("x-kopetro-client-ip") ?? "";
  if (!await allowLoginAttempt(isIP(client) ? client : "unknown")) return adminRedirect(loginFailed);

  const data = await request.formData();
  const input = credentials.safeParse({ email: data.get("email"), password: data.get("password") });
  if (!input.success) return adminRedirect(loginFailed);

  const admin = await verifyAdmin(input.data.email, input.data.password);
  if (!admin) return adminRedirect(loginFailed);
  await startAdminSession(admin.id);
  return adminRedirect("/admin");
}
