import { createHash, createHmac, randomUUID } from "node:crypto";
import type { ElectionStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { z } from "zod";
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

export function credentialFingerprint(hash: string) {
  return createHash("sha256").update(hash).digest("hex");
}

type LoginEntry = { electionId: string | null; voterId: string | null; keyHash: string | null };
type LoginWaiter = {
  code: string;
  resolve: (entry: LoginEntry) => void;
  reject: (error: unknown) => void;
};
const loginBatches = new Map<string, LoginWaiter[]>();

// Coalesce a brief burst from a shared network into one atomic IP counter update.
function loadLogin(code: string, ip: string) {
  const ipKey = rateKey("ip", ip);
  return new Promise<LoginEntry>((resolve, reject) => {
    const batch = loginBatches.get(ipKey);
    if (batch) {
      batch.push({ code, resolve, reject });
      if (batch.length === 100) void flushLoginBatch(ipKey, batch);
      return;
    }

    const first = [{ code, resolve, reject }];
    loginBatches.set(ipKey, first);
    setTimeout(() => void flushLoginBatch(ipKey, first), 5);
  });
}

async function flushLoginBatch(ipKey: string, batch: LoginWaiter[]) {
  if (loginBatches.get(ipKey) !== batch) return;
  loginBatches.delete(ipKey);
  const size = batch.length;
  try {
    const entries = await prisma.$queryRaw<LoginEntry[]>`
      WITH ip_attempt AS (
        INSERT INTO "VoterLoginLimit" ("key", "attempts", "expiresAt")
        VALUES (${ipKey}, ${size}::int, NOW() + ${limitMilliseconds} * INTERVAL '1 millisecond')
        ON CONFLICT ("key") DO UPDATE SET
          "attempts" = CASE WHEN "VoterLoginLimit"."expiresAt" <= NOW()
            THEN EXCLUDED."attempts"
            ELSE LEAST("VoterLoginLimit"."attempts" + EXCLUDED."attempts", ${maxIpAttempts + size}) END,
          "expiresAt" = CASE WHEN "VoterLoginLimit"."expiresAt" <= NOW()
            THEN EXCLUDED."expiresAt" ELSE "VoterLoginLimit"."expiresAt" END
        RETURNING "attempts"
      )
      SELECT election.id AS "electionId", v.id AS "voterId", v."keyHash"
      FROM ip_attempt
      CROSS JOIN jsonb_array_elements_text(${JSON.stringify(batch.map(waiter => waiter.code))}::jsonb)
        WITH ORDINALITY AS input(code, arrival)
      LEFT JOIN LATERAL (
        SELECT id FROM "Election" ORDER BY "createdAt" DESC, id DESC LIMIT 1
      ) election ON ip_attempt.attempts - ${size} + input.arrival <= ${maxIpAttempts}
      LEFT JOIN "Voter" v ON v."electionId" = election.id AND v.code = input.code
      ORDER BY input.arrival
    `;
    for (const [index, waiter] of batch.entries()) waiter.resolve(entries[index]);
  } catch (error) {
    for (const waiter of batch) waiter.reject(error);
  }
}

export async function voterSessionId() {
  const cookie = (await cookies()).get(cookieName)?.value;
  return cookie ? readSessionId(cookie, voterSecret()) : null;
}

export async function findVoterSession(id: string) {
  const [session] = await prisma.$queryRaw<{
    name: string; electionId: string; hasVoted: boolean; keyHash: string; credentialFingerprint: string;
    status: ElectionStatus; startsAt: Date | null; endsAt: Date | null; resultsPublished: boolean;
  }[]>`
    SELECT v.name, v."electionId", v."hasVoted", v."keyHash", s."credentialFingerprint",
           e.status, e."startsAt", e."endsAt", e."resultsPublished"
    FROM "VoterSession" s JOIN "Voter" v ON v.id = s."voterId"
    JOIN "Election" e ON e.id = v."electionId"
    WHERE s.id = ${id}::uuid AND s."expiresAt" > NOW()
  `;
  if (!session || session.credentialFingerprint !== credentialFingerprint(session.keyHash)) return null;
  const { name, electionId, hasVoted, status, startsAt, endsAt, resultsPublished } = session;
  return { name, electionId, hasVoted, status, startsAt, endsAt, resultsPublished };
}

export async function startVoterSession(code: string, key: string, ip: string) {
  const entry = await loadLogin(code, ip);
  if (!entry?.electionId || !code) return { status: "invalid" } as const;
  const bucket = rateKey("code", `${entry.electionId}:${code}`);
  const limit = await prisma.voterLoginLimit.findUnique({ where: { key: bucket } });
  if (limit && limit.attempts >= maxCodeFailures && limit.expiresAt > new Date()) return { status: "invalid" } as const;

  // Keep Argon2 outside the database transaction so bursts do not occupy the connection pool.
  const verifier = entry.keyHash ?? await (dummyHash ??= hashCredential(randomUUID()));
  const matched = await verifyCredential(verifier, key);
  if (!entry.voterId || !entry.keyHash || !matched) {
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
    return { status: "invalid" } as const;
  }

  const previous = await voterSessionId();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + sessionLifetime);
  // The rate check and session insert share one statement. Successful logins with no failures leave no code counter.
  const [result] = await prisma.$queryRaw<{
    status: ElectionStatus; startsAt: Date | null; endsAt: Date | null; hasVoted: boolean;
    sessionId: string | null; name: string; electionId: string;
  }[]>`
    WITH reset AS (
      UPDATE "VoterLoginLimit" SET "attempts" = 0, "expiresAt" = NOW()
      WHERE "key" = ${bucket} AND ("expiresAt" <= NOW() OR "attempts" < ${maxCodeFailures})
      RETURNING "key"
    ), allowed AS (
      SELECT 1 WHERE EXISTS (SELECT 1 FROM reset)
        OR NOT EXISTS (SELECT 1 FROM "VoterLoginLimit" WHERE "key" = ${bucket})
    ), verified AS MATERIALIZED (
      SELECT v.id, v.name, v."electionId", v."hasVoted", e.status, e."startsAt", e."endsAt", e."resultsPublished"
      FROM allowed CROSS JOIN "Voter" v JOIN "Election" e ON e.id = v."electionId"
      WHERE v.id = ${entry.voterId}::uuid AND v."keyHash" = ${entry.keyHash}
      FOR SHARE OF v
    ), eligible AS (
      SELECT id FROM verified WHERE
        (NOT "hasVoted" AND status IN ('OPEN', 'SCHEDULED')
         AND (status = 'OPEN' OR "startsAt" <= NOW()) AND ("endsAt" IS NULL OR "endsAt" > NOW()))
        OR ("resultsPublished" AND (status = 'CLOSED' OR (status IN ('OPEN', 'SCHEDULED') AND "endsAt" <= NOW())))
    ), revoked AS (
      DELETE FROM "VoterSession" WHERE id = ${previous}::uuid AND EXISTS (SELECT 1 FROM eligible)
    ), issued AS (
      INSERT INTO "VoterSession" (id, "voterId", "credentialFingerprint", "expiresAt")
      SELECT ${sessionId}::uuid, id, ${credentialFingerprint(entry.keyHash)}, ${expiresAt} FROM eligible RETURNING id
    )
    SELECT verified.name, verified."electionId", verified.status, verified."startsAt", verified."endsAt", verified."hasVoted", issued.id AS "sessionId"
    FROM verified LEFT JOIN issued ON true
  `;

  if (!result) return { status: "invalid" } as const;
  if (!result.sessionId) {
    const status = effectiveStatus(result);
    if (status === "CLOSED") return { status: "closed" } as const;
    return { status: status === "OPEN" && result.hasVoted ? "voted" : "not-open" } as const;
  }
  (await cookies()).set(cookieName, signSession(result.sessionId, voterSecret()), { ...cookieOptions, expires: expiresAt });
  return { status: "ok", name: result.name, electionId: result.electionId, electionStatus: effectiveStatus(result) } as const;
}

export async function endVoterSession() {
  const id = await voterSessionId();
  if (id) await prisma.voterSession.deleteMany({ where: { id } });
  (await cookies()).set(cookieName, "", { ...cookieOptions, maxAge: 0 });
}
