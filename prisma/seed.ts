import { issueVoterKey } from "../lib/voter-keys";
import { prisma } from "../lib/db";
import { emailSchema, hashCredential, passwordSchema } from "../lib/credentials";

const positions = [
  { title: "Pengerusi", maxChoices: 1, candidates: [
    ["Dato Rahim Salleh", "Penyandang. 12 tahun dalam lembaga."],
    ["Hajah Salmah Idris", "Bekas bendahari, fokus tadbir urus."],
    ["Encik Faizal Nor", "Calon baharu, pakar kewangan."],
  ] },
  { title: "Setiausaha", maxChoices: 1, candidates: [
    ["Puan Rohana Ali", "Setiausaha penggal lepas."],
    ["Encik Hisham Daud", "Peguam syariah."],
  ] },
  { title: "Ahli Lembaga", maxChoices: 2, candidates: [
    ["Azman Latif", "Operasi dan logistik."],
    ["Noraini Kassim", "Sumber manusia."],
    ["Shahrul Nizam", "Teknologi maklumat."],
  ] },
];
const voters = [
  "Ahmad Faiz", "Siti Aminah", "Razak Hamid", "Nurul Huda", "Zulkifli Yusof", "Farah Nabila",
  "Hafiz Rahman", "Aishah Karim", "Mohd Syafiq", "Lina Abdullah", "Kamal Ariffin", "Zarina Osman",
];
const demoId = "feb5c62c-5df0-47a4-94a4-f317744faeab";


async function seed() {
  const email = emailSchema.parse(process.env.ADMIN_EMAIL);
  const password = passwordSchema.safeParse(process.env.ADMIN_PASSWORD);
  if (!password.success) throw new Error("ADMIN_PASSWORD must be 12–256 characters.");

  if (!(await prisma.admin.findUnique({ where: { email } }))) {
    await prisma.admin.upsert({
      where: { email }, update: {}, create: { email, passwordHash: await hashCredential(password.data) },
    });
  }

  if (await prisma.election.findFirst()) return;
  const demo = process.env.SEED_DEMO === "true";

  const entries = [];
  for (const [index, name] of (demo ? voters : []).entries()) {
    const { keyHash } = await issueVoterKey();
    entries.push({ name, code: `KP-${String(index + 1).padStart(3, "0")}`, keyHash });
  }

  await prisma.election.create({ data: {
    id: demoId, name: "Pemilihan AGM 2026", orgName: "Koperasi Kopetro", logoPath: "/kopetro.png",
    positions: { create: (demo ? positions : []).map(({ title, maxChoices, candidates }, sortOrder) => ({
      title, maxChoices, sortOrder,
      candidates: { create: candidates.map(([name, bio], sortOrder) => ({ name, bio, sortOrder })) },
    })) },
    voters: { create: entries },
    auditLogs: { create: { actor: "SYSTEM", action: demo ? "DEMO_CREATED" : "ELECTION_CREATED", detail: {} } },
  } });
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
