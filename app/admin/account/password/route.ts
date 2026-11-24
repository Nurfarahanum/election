import { z } from "zod";
import { allowLoginAttempt, changeAdminPassword, currentAdmin, endAdminSession } from "../../../../lib/admin-auth";
import { passwordSchema } from "../../../../lib/credentials";
import { acceptsOrigin, redirectAfterPost, requestIp } from "../../../../lib/request-security";

const inputSchema = z.object({ current: passwordSchema, password: passwordSchema, confirmation: passwordSchema })
  .refine(input => input.password === input.confirmation && input.password !== input.current);

export async function POST(request: Request) {
  if (!acceptsOrigin(request)) return new Response(null, { status: 403 });
  const admin = await currentAdmin();
  if (!admin) return redirectAfterPost("/admin/login");
  const failed = "/admin/account?ralat=1";
  if (!await allowLoginAttempt(requestIp(request))) return redirectAfterPost(failed);
  const fields = await request.formData().then(Object.fromEntries).catch(() => ({}));
  const input = inputSchema.safeParse(fields);
  if (!input.success || !await changeAdminPassword(admin.id, input.data.current, input.data.password)) return redirectAfterPost(failed);
  await endAdminSession();
  return redirectAfterPost("/admin/login?ditukar=1");
}
