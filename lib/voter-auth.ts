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
  const [limit, voter] = await Promise.all([
    prisma.voterLoginLimit.findUnique({ where: { key: bucket } }),
    prisma.voter.findUnique({
      where: { electionId_code: { electionId: election.id, code } },
      select: { id: true, keyHash: true },
    }),
  ]);
  if (limit && limit.attempts >= maxCodeFailures && limit.expiresAt > new Date()) return "invalid";

  // Keep Argon2 outside the database transaction so bursts do not occupy the connection pool.
  const verifier = voter?.keyHash ?? await (dummyHash ??= hashCredential(randomUUID()));
  const matched = await verifyCredential(verifier, key);
  if (!voter || !matched) {
    await prisma.$executeRaw`
      INSERT INTO "VoterLoginLimit" ("key", "attempts", "expiresAt")
      VALUES (${bucket}, 1, NOW() + ${limitMilliseconds} * INTERVAL '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "VoterLoginLimit"."expiresAt" <= NOW()
          THEN 1 ELSE "VoterLoginLimit"."attempts" + 1 END,
        "expiresAt" = CASE WHEN "VoterLoginLimit"."expiresAt" <= NOW()
            OR "VoterLoginLimit"."attempts" = ${maxCodeFailures - 1}
          THEN EXCLUDED."expiresAt" ELSE "VoterLoginLimit"."expiresAt" END
      WHERE "VoterLoginLimit"."expiresAt" <= NOW() OR "VoterLoginLimit"."attempts" < ${maxCodeFailures}
    `;
    return "invalid";
  }

  const result = await prisma.$transaction(async (tx) => {
    // A successful verification still loses to any lockout committed while Argon2 was running.
    const reset = await tx.$executeRaw`
      INSERT INTO "VoterLoginLimit" ("key", "attempts", "expiresAt")
      VALUES (${bucket}, 0, NOW())
      ON CONFLICT ("key") DO UPDATE SET "attempts" = 0, "expiresAt" = EXCLUDED."expiresAt"
      WHERE "VoterLoginLimit"."expiresAt" <= NOW() OR "VoterLoginLimit"."attempts" < ${maxCodeFailures}
    `;
    if (!reset) return { status: "invalid" } as const;
    const current = await tx.election.findUniqueOrThrow({ where: { id: election.id } });
    const status = effectiveStatus(current);
    const publishedResults = status === "CLOSED" && current.resultsPublished;
    if (status !== "OPEN" && !publishedResults) return { status: status === "CLOSED" ? "closed" : "not-open" } as const;
    const [eligible] = await tx.$queryRaw<{ hasVoted: boolean }[]>`
      SELECT "hasVoted" FROM "Voter" WHERE id = ${voter.id}::uuid AND "keyHash" = ${voter.keyHash} FOR SHARE
    `;
    if (!eligible) return { status: "invalid" } as const;
    if (status === "OPEN" && eligible.hasVoted) return { status: "voted" } as const;

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
