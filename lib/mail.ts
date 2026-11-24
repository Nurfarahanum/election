import { createTransport } from "nodemailer";
import { z } from "zod";
import { AdminInputError } from "./admin-election";
import { emailSchema } from "./credentials";

const settingsSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  from: emailSchema,
  secure: z.enum(["true", "false"]),
  requireTLS: z.enum(["true", "false"]),
  user: z.string(),
  password: z.string(),
}).refine(settings => Boolean(settings.user) === Boolean(settings.password));

export function createElectionMailer() {
  const parsed = settingsSchema.safeParse({
    host: process.env.SMTP_HOST, from: process.env.SMTP_FROM, port: process.env.SMTP_PORT || "587",
    secure: process.env.SMTP_SECURE || "false", requireTLS: process.env.SMTP_REQUIRE_TLS || "true",
    user: process.env.SMTP_USER ?? "", password: process.env.SMTP_PASSWORD ?? "",
  });
  if (!parsed.success) throw new AdminInputError("Tetapan SMTP belum lengkap.", 503);

  const settings = parsed.data;
  return {
    from: settings.from,
    transport: createTransport({
      pool: true,
      host: settings.host, port: settings.port, secure: settings.secure === "true",
      requireTLS: settings.secure !== "true" && settings.requireTLS === "true",
      auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
      maxConnections: 4,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      maxRequeues: 0,
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
  };
}
