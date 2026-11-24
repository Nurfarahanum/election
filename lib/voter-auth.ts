import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { z } from "zod";
import { activeElection } from "./admin-election";
import { verifyCredential, hashCredential } from "./credentials";
import { prisma } from "./db";
import { effectiveStatus } from "./election";
import { sessionSecret } from "./request-security";
import { readSessionId, signSession } from "./session-token";

const cookieName = "__Host-kopetro-voter";
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;
const sessionLifetime = 4 * 60 * 60 * 1000;
const limitMilliseconds = 15 * 60 * 1000;
const maxCodeFailures = 5;
const maxIpAttempts = 300;
let dummyHash: Promise<string> | undefined;

export const voterCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,32}$/);
export const voterKey = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,8}$/);

function voterSecret() {
  return createHmac("sha256", sessionSecret()).update("voter-session").digest("hex");
}

function rateKey(bucket: string, value: string) {
  return createHmac("sha256", sessionSecret()).update(`voter-limit:${bucket}:${value}`).digest("hex");
}

function credentialFingerprint(hash: string) {
  return createHash("sha256").update(hash).digest("hex");
}

export async function allowVoterIp(ip: string) {
  const key = rateKey("ip", ip);
  const [result] = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "VoterLoginLimit" ("key", "attempts", "expiresAt")
    VALUES (${key}, 1, NOW() + ${limitMilliseconds} * INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "VoterLoginLimit"."expiresAt" <= NOW()
        THEN 1 ELSE LEAST("VoterLoginLimit"."attempts" + 1, ${maxIpAttempts + 1}) END,
      "expiresAt" = CASE WHEN "VoterLoginLimit"."expiresAt" <= NOW()
        THEN EXCLUDED."expiresAt" ELSE "VoterLoginLimit"."expiresAt" END
    RETURNING "attempts"
  `;
  return result.attempts <= maxIpAttempts;
}

export async function voterSessionId() {
  const cookie = (await cookies()).get(cookieName)?.value;
  return cookie ? readSessionId(cookie, voterSecret()) : null;
}

export async function findVoterSession(id: string, db: Prisma.TransactionClient = prisma) {
  const session = await db.voterSession.findUnique({
    where: { id },
    select: {
      expiresAt: true, credentialFingerprint: true,
      voter: { select: { id: true, code: true, name: true, keyHash: true, electionId: true, hasVoted: true } },
    },
  });
  if (!session || session.expiresAt <= new Date() ||
      session.credentialFingerprint !== credentialFingerprint(session.voter.keyHash)) return null;

  const { id: voterId, code, name, electionId, hasVoted } = session.voter;
  return { voterId, code, name, electionId, hasVoted };
}

export async function startVoterSession(code: string, key: string) {
  const previous = await voterSessionId();
  const election = await activeElection();
  if (!election) return "invalid";
  const bucket = rateKey("code", `${election.id}:${code}`);
  const fallback = await (dummyHash ??= hashCredential(randomUUID()));

  const result = await prisma.$transaction(async (tx) => {
    // Serialize attempts against one code, including unregistered codes.
    await tx.$executeRaw`
      INSERT INTO "VoterLoginLimit" ("key", "attempts", "expiresAt")
      VALUES (${bucket}, 0, NOW()) ON CONFLICT ("key") DO NOTHING
    `;
    const [limit] = await tx.$queryRaw<{ attempts: number; expiresAt: Date }[]>`
      SELECT "attempts", "expiresAt" FROM "VoterLoginLimit" WHERE "key" = ${bucket} FOR UPDATE
    `;
    const expired = limit.expiresAt <= new Date();
    if (!expired && limit.attempts >= maxCodeFailures) return { status: "invalid" } as const;

    const voter = await tx.voter.findUnique({
      where: { electionId_code: { electionId: election.id, code } },
      select: { id: true, keyHash: true, hasVoted: true },
    });
    const matched = await verifyCredential(voter?.keyHash ?? fallback, key);
    if (!voter || !matched) {
      const attempts = expired ? 1 : limit.attempts + 1;
      const expiresAt = expired || attempts === maxCodeFailures
        ? new Date(Date.now() + limitMilliseconds) : limit.expiresAt;
      await tx.voterLoginLimit.update({ where: { key: bucket }, data: { attempts, expiresAt } });
      return { status: "invalid" } as const;
    }

    await tx.voterLoginLimit.delete({ where: { key: bucket } });
    const current = await tx.election.findUniqueOrThrow({ where: { id: election.id } });
    const status = effectiveStatus(current);
    if (status !== "OPEN") return { status: status === "CLOSED" ? "closed" : "not-open" } as const;
    if (voter.hasVoted) return { status: "voted" } as const;

    const expiresAt = new Date(Date.now() + sessionLifetime);
    if (previous) await tx.voterSession.deleteMany({ where: { id: previous } });
    const session = await tx.voterSession.create({
      data: { voterId: voter.id, expiresAt, credentialFingerprint: credentialFingerprint(voter.keyHash) },
      select: { id: true, expiresAt: true },
    });
    return { status: "ok", session } as const;
  }, { maxWait: 5000, timeout: 15000 });

  if (result.status === "ok") {
    (await cookies()).set(cookieName, signSession(result.session.id, voterSecret()), {
      ...cookieOptions, expires: result.session.expiresAt,
    });
  }
  return result.status;
}

export async function endVoterSession() {
  const id = await voterSessionId();
  if (id) await prisma.voterSession.deleteMany({ where: { id } });
  (await cookies()).set(cookieName, "", { ...cookieOptions, maxAge: 0 });
}
