import { z } from "zod";
import { emailSchema, passwordSchema } from "../../../lib/credentials";
import { allowLoginAttempt, startAdminSession, verifyAdmin } from "../../../lib/admin-auth";

import { acceptsOrigin, redirectAfterPost, requestIp } from "../../../lib/request-security";

const credentials = z.object({ email: emailSchema, password: passwordSchema });
const loginFailed = "/admin/login?ralat=1";

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") {
    return new Response(null, { status: 415 });
  }

  if (!await allowLoginAttempt(requestIp(request))) return redirectAfterPost(loginFailed);

  const data = await request.formData();
  const input = credentials.safeParse({ email: data.get("email"), password: data.get("password") });
  if (!input.success) return redirectAfterPost(loginFailed);

  const admin = await verifyAdmin(input.data.email, input.data.password);
  if (!admin || !await startAdminSession(admin.id, admin.passwordHash)) return redirectAfterPost(loginFailed);
  return redirectAfterPost("/admin");
}
