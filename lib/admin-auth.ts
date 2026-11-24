import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { sessionSecret } from "./request-security";
import { prisma } from "./db";
import { hashCredential, verifyCredential } from "./credentials";
import { readSessionId, signSession } from "./session-token";

const cookieName = "__Host-kopetro-admin";
const sessionLifetime = 8 * 60 * 60 * 1000;
const limitWindowSeconds = 900;
const maxAttempts = 10;
let dummyHash: Promise<string> | undefined;

export async function allowLoginAttempt(ip: string) {
  const key = createHmac("sha256", sessionSecret()).update(ip).digest("hex");
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

export async function startAdminSession(adminId: string, verifiedHash: string) {
  const previous = await currentSessionId();
  const expiresAt = new Date(Date.now() + sessionLifetime);
  const session = await prisma.$transaction(async (tx) => {
    const [admin] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Admin" WHERE id = ${adminId}::uuid AND "passwordHash" = ${verifiedHash} FOR SHARE
    `;
    if (!admin) return null;
    if (previous) await tx.adminSession.deleteMany({ where: { id: previous } });
    const created = await tx.adminSession.create({ data: { adminId, expiresAt } });
    await record(tx, `ADMIN:${adminId}`, "ADMIN_LOGIN");
    return created;
  });
  if (!session) return false;
  (await cookies()).set(cookieName, signSession(session.id, sessionSecret()), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt,
  });
  return true;
}

async function currentSessionId() {
  const token = (await cookies()).get(cookieName)?.value;
  return token ? readSessionId(token, sessionSecret()) : null;
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

export async function changeAdminPassword(adminId: string, currentPassword: string, newPassword: string) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { passwordHash: true } });
  if (!admin || !await verifyCredential(admin.passwordHash, currentPassword)) return false;
  const passwordHash = await hashCredential(newPassword);
  return prisma.$transaction(async tx => {
    const update = await tx.admin.updateMany({
      where: { id: adminId, passwordHash: admin.passwordHash }, data: { passwordHash },
    });
    if (!update.count) return false;
    await tx.adminSession.deleteMany({ where: { adminId } });
    await record(tx, `ADMIN:${adminId}`, "ADMIN_PASSWORD_CHANGED");
    return true;
  });
}
