import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hashCredential, verifyCredential } from "./credentials";
import { readSessionId, signSession } from "./session-token";

const cookieName = "__Host-kopetro-admin";
const sessionLifetime = 8 * 60 * 60 * 1000;
const limitWindowSeconds = 900;
const maxAttempts = 10;
let dummyHash: Promise<string> | undefined;

function secret() {
  return z.string().min(32).parse(process.env.SESSION_SECRET);
}

export function acceptsOrigin(request: Request) {
  const canonical = new URL(z.url().parse(process.env.APP_ORIGIN));
  return canonical.protocol === "https:" && request.headers.get("origin") === canonical.origin;
}

export function adminRedirect(path: string) {
  const response = new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
  return response;
}

export async function allowLoginAttempt(ip: string) {
  const key = createHmac("sha256", secret()).update(ip).digest("hex");
  const [result] = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "AdminLoginLimit" ("key", "attempts", "expiresAt")
    VALUES (${key}, 1, NOW() + ${limitWindowSeconds} * INTERVAL '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AdminLoginLimit"."expiresAt" <= NOW()
        THEN 1 ELSE LEAST("AdminLoginLimit"."attempts" + 1, ${maxAttempts + 1}) END,
      "expiresAt" = CASE WHEN "AdminLoginLimit"."expiresAt" <= NOW()
        THEN EXCLUDED."expiresAt" ELSE "AdminLoginLimit"."expiresAt" END
    RETURNING "attempts"
  `;
  return result.attempts <= maxAttempts;
}

export async function verifyAdmin(email: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { email } });
  const encoded = admin?.passwordHash ?? await (dummyHash ??= hashCredential(randomUUID()));
  return await verifyCredential(encoded, password) ? admin : null;
}

async function record(tx: Prisma.TransactionClient, actor: string, action: string) {
  const election = await tx.election.findFirstOrThrow({ orderBy: { createdAt: "desc" }, select: { id: true } });
  await tx.auditLog.create({ data: { electionId: election.id, actor, action, detail: {} } });
}

export async function startAdminSession(adminId: string) {
  const previous = await currentSessionId();
  const expiresAt = new Date(Date.now() + sessionLifetime);
  const session = await prisma.$transaction(async (tx) => {
    if (previous) await tx.adminSession.deleteMany({ where: { id: previous } });
    const created = await tx.adminSession.create({ data: { adminId, expiresAt } });
    await record(tx, `ADMIN:${adminId}`, "ADMIN_LOGIN");
    return created;
  });
  (await cookies()).set(cookieName, signSession(session.id, secret()), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt,
  });
}

async function currentSessionId() {
  const token = (await cookies()).get(cookieName)?.value;
  return token ? readSessionId(token, secret()) : null;
}

export async function currentAdmin() {
  const id = await currentSessionId();
  if (!id) return null;
  const session = await prisma.adminSession.findFirst({
    where: { id, expiresAt: { gt: new Date() } },
    select: { admin: { select: { id: true, email: true } } },
  });
  return session?.admin ?? null;
}

export async function endAdminSession() {
  const id = await currentSessionId();
  if (id) {
    await prisma.$transaction(async (tx) => {
      const session = await tx.adminSession.findFirst({ where: { id, expiresAt: { gt: new Date() } } });
      const deleted = await tx.adminSession.deleteMany({ where: { id } });
      if (session && deleted.count) await record(tx, `ADMIN:${session.adminId}`, "ADMIN_LOGOUT");
    });
  }
  (await cookies()).set(cookieName, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}
