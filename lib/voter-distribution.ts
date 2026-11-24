import type { Election } from "@prisma/client";
import { z } from "zod";
import { AdminInputError, auditAdmin, withElectionLock } from "./admin-election";
import { verifyCredential } from "./credentials";
import { prisma } from "./db";
import { voterSlips } from "./documents";
import { effectiveStatus } from "./election";
import { createElectionMailer } from "./mail";
import { formatMalaysiaTime } from "./malaysia-time";
import { appOrigin } from "./request-security";
import { issueVoterKey } from "./voter-keys";

export const distributionCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("slips"), voterId: z.uuid().optional(), withoutEmail: z.literal("true").optional() }),
  z.object({ action: z.literal("invitations"), voterId: z.uuid().optional() }),
  z.object({ action: z.literal("reminders"), voterId: z.uuid().optional() }),
]);

export function voterUrl() {
  const url = appOrigin();
  if (url.protocol !== "https:") throw new Error("APP_ORIGIN must use HTTPS");
  return new URL("/vote", url).href;
}

function requireActiveDistribution(election: Election) {
  if (effectiveStatus(election) === "CLOSED") {
    throw new AdminInputError("Undian sudah ditutup.", 409);
  }
}

type VoterRecord = { id: string; name: string; code: string; email: string | null; keyHash: string };

async function newKey(previousHash: string) {
  let generated = await issueVoterKey();
  while (await verifyCredential(previousHash, generated.key)) generated = await issueVoterKey();
  return generated;
}

export async function prepareSlips(
  election: Election, adminId: string, options: { voterId?: string; withoutEmail?: string },
) {
  requireActiveDistribution(election);
  const voters = await prisma.voter.findMany({
    where: { electionId: election.id, hasVoted: false, id: options.voterId, email: options.withoutEmail ? null : undefined },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, keyHash: true },
  });
  if (!voters.length) throw new AdminInputError("Tiada pengundi layak untuk slip.", 409);

  const prepared: (typeof voters[number] & { key: string; newHash: string })[] = [];
  for (const voter of voters) {
    const credential = await newKey(voter.keyHash);
    prepared.push({ ...voter, key: credential.key, newHash: credential.keyHash });
  }
  const pdf = await voterSlips(election.orgName, election.name, voterUrl(), prepared);

  await withElectionLock(election.id, async (tx, current) => {
    requireActiveDistribution(current);
    for (const voter of prepared) {
      const updated = await tx.voter.updateMany({
        where: { id: voter.id, electionId: election.id, hasVoted: false, keyHash: voter.keyHash },
        data: { keyHash: voter.newHash },
      });
      if (!updated.count) throw new AdminInputError("Senarai atau kunci pengundi telah berubah. Cuba lagi.", 409);
    }
    await auditAdmin(tx, election.id, adminId, "VOTER_SLIPS", {
      count: prepared.length, codes: prepared.map(voter => voter.code),
    });
  });
  return pdf;
}

function mailText(voter: VoterRecord, election: Election, key?: string) {
  const url = voterUrl();
  const schedule = [
    election.startsAt && `Mula: ${formatMalaysiaTime(election.startsAt)}`,
    election.endsAt && `Tamat: ${formatMalaysiaTime(election.endsAt)}`,
  ].filter(Boolean);
  return [
    `Salam ${voter.name},`, "",
    key ? `Anda dijemput mengundi untuk ${election.name}.` : `Ini peringatan untuk mengundi bagi ${election.name}.`,
    ...schedule, "",
    `Pautan undian: ${url}`,
    `ID Pengundi: ${voter.code}`,
    key ? `Kunci Pengundi: ${key}` : "Gunakan kunci pengundi yang sudah diberikan kepada anda.", "",
    "Sila simpan maklumat pengundian anda.", election.orgName,
  ].join("\n");
}

export async function distributeMail(election: Election, adminId: string, kind: "invitations" | "reminders", voterId?: string) {
  requireActiveDistribution(election);
  const voters = await prisma.voter.findMany({
    where: { electionId: election.id, hasVoted: false, id: voterId, email: { not: null } },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true, email: true, keyHash: true },
  });
  if (!voters.length) throw new AdminInputError("Tiada pengundi belum mengundi yang mempunyai emel.", 409);

  const { from, transport } = createElectionMailer();
  const failures: string[] = [];
  const sent: string[] = [];
  const skipped: string[] = [];
  const inviting = kind === "invitations";
  let cursor = 0;
  try {
    try {
      await transport.verify();
    } catch {
      throw new AdminInputError("Sambungan SMTP gagal. Semak tetapan dan cuba lagi.", 503);
    }

    async function sendNext() {
      while (cursor < voters.length) {
        const voter = voters[cursor++];
        try {
          const credential = inviting ? await newKey(voter.keyHash) : undefined;
          const accepted = await prisma.$transaction(async tx => {
            const [current] = await tx.$queryRaw<VoterRecord[]>`
              SELECT id, name, code, email, "keyHash" FROM "Voter"
              WHERE id = ${voter.id}::uuid AND "electionId" = ${election.id}::uuid
                AND NOT "hasVoted" AND email IS NOT NULL
              FOR NO KEY UPDATE
            `;
            const currentElection = await tx.election.findUniqueOrThrow({ where: { id: election.id } });
            if (!current?.email || current.keyHash !== voter.keyHash || effectiveStatus(currentElection) === "CLOSED") {
              return false;
            }
            if (credential) {
              await tx.voter.update({ where: { id: current.id }, data: { keyHash: credential.keyHash } });
            }
            await auditAdmin(tx, election.id, adminId, inviting ? "VOTER_INVITATION" : "VOTER_REMINDER", { code: current.code });
            // Hold the voter row through SMTP acceptance so a definite rejection rolls back the new key.
            const result = await transport.sendMail({
              from, to: current.email,
              subject: `${inviting ? "Jemputan" : "Peringatan"} mengundi · ${currentElection.name.replace(/[\r\n]+/g, " ")}`,
              text: mailText(current, currentElection, credential?.key),
            });
            if (!result.accepted.length) throw new Error("SMTP rejected recipient");
            return true;
          }, { maxWait: 10000, timeout: 25000 });
          (accepted ? sent : skipped).push(voter.code);
        } catch {
          failures.push(voter.code);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(4, voters.length) }, sendNext));
  } finally {
    transport.close();
  }

  await auditAdmin(prisma, election.id, adminId, inviting ? "INVITATIONS_BATCH" : "REMINDERS_BATCH", {
    sent: sent.length, failed: failures, skipped,
  });
  return { sent: sent.length, failures: failures.sort(), skipped: skipped.sort() };
}
