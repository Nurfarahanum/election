import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentAdmin } from "../../../lib/admin-auth";
import { activeElection } from "../../../lib/admin-election";
import { prisma } from "../../../lib/db";
import { formatMalaysiaTime } from "../../../lib/malaysia-time";
import { AdminNav } from "../admin-nav";

const actions: Record<string, string> = {
  DEMO_CREATED: "Pilihan raya dicipta (data demo).",
  ELECTION_CREATED: "Pilihan raya dicipta.",
  ELECTION_UPDATE: "Maklumat pilihan raya disimpan.",
  ELECTION_SCHEDULE: "Jadual disimpan.",
  ELECTION_OPEN: "Undian dibuka.",
  ELECTION_CLOSE: "Undian ditutup.",
  ELECTION_DRAFT: "Pilihan raya dikembalikan ke draf.",
  RESULTS_VISIBILITY: "Tetapan paparan keputusan disimpan.",
  RESULTS_PUBLISH: "Penerbitan keputusan diubah.",
  VOTE_SUBMITTED: "Undi direkodkan.",
  VOTER_SLIPS: "Slip pengundi dijana.",
  VOTER_INVITATION: "Emel jemputan dihantar.",
  VOTER_REMINDER: "Peringatan dihantar.",
  INVITATIONS_BATCH: "Edaran jemputan selesai.",
  REMINDERS_BATCH: "Edaran peringatan selesai.",
  FILE_EXPORT: "Fail dieksport.",
  VOTER_ADD: "Pengundi ditambah.",
  VOTER_REMOVE: "Pengundi dibuang.",
  VOTER_REGENERATE: "Kunci pengundi dijana semula.",
  VOTERS_IMPORT: "Senarai pengundi diimport.",
  POSITION_ADD: "Jawatan ditambah.",
  POSITION_UPDATE: "Jawatan diubah.",
  POSITION_REMOVE: "Jawatan dibuang.",
  CANDIDATE_ADD: "Calon ditambah.",
  CANDIDATE_UPDATE: "Calon diubah.",
  CANDIDATE_REMOVE: "Calon dibuang.",
  CANDIDATE_PHOTO_REMOVE: "Foto calon dibuang.",
  ADMIN_LOGIN: "Admin log masuk.",
  ADMIN_PASSWORD_CHANGED: "Kata laluan admin ditukar.",
  BRANDING_UPDATE: "Penjenamaan dikemas kini.",
  BRANDING_RESET: "Penjenamaan lalai dipulihkan.",
  ADMIN_LOGOUT: "Admin log keluar.",
};
const pageSize = 50;
const pageInput = z.coerce.number().int().min(1).max(100000);

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ halaman?: string }> }) {
  if (!await currentAdmin()) redirect("/admin/login");
  const election = await activeElection();
  if (!election) return <p>Tiada pilihan raya.</p>;

  const page = pageInput.safeParse((await searchParams).halaman).data ?? 1;
  const logs = await prisma.auditLog.findMany({
    where: { electionId: election.id },
    orderBy: [{ at: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize + 1,
    select: { id: true, at: true, actor: true, action: true, detail: true },
  });

  return (
    <>
      <AdminNav current="/admin/audit" />
      <section className="card">
        <h2 className="font-bold">Log audit</h2>
        <p className="mut my-2">Mencatat siapa sudah mengundi, tanpa mendedahkan pilihan mereka.</p>
        <a className="ghost mb-3 inline-flex items-center" href="/admin/export/log-audit.csv" download>Muat turun log audit (CSV)</a>
        {logs.length === 0 && <p className="mut">Tiada rekod pada halaman ini.</p>}
        <ul>
          {logs.slice(0, pageSize).map(log => (
            <li key={log.id} className="border-t border-[var(--line)] py-2">
              <div className="flex flex-wrap justify-between gap-x-3">
                <b>{actions[log.action] ?? log.action}</b>
                <time className="mut" dateTime={log.at.toISOString()}>{formatMalaysiaTime(log.at)}</time>
              </div>
              <p className="mut wrap-anywhere">{log.actor}</p>
              {log.action !== "VOTE_SUBMITTED" && JSON.stringify(log.detail) !== "{}" && (
                <details>
                  <summary>Butiran</summary>
                  <p className="mut wrap-anywhere">{JSON.stringify(log.detail)}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
        {(page > 1 || logs.length > pageSize) && <nav className="mt-3 flex flex-wrap items-center gap-3" aria-label="Halaman log audit">
          {page > 1 && <Link className="ghost" href={`/admin/audit?halaman=${page - 1}`}>Sebelumnya</Link>}
          <span>Halaman {page}</span>
          {logs.length > pageSize && <Link className="ghost" href={`/admin/audit?halaman=${page + 1}`}>Seterusnya</Link>}
        </nav>}
      </section>
    </>
  );
}
