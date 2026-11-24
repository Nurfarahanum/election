import { redirect } from "next/navigation";
import { currentAdmin } from "../../../lib/admin-auth";
import { activeElection } from "../../../lib/admin-election";
import { prisma } from "../../../lib/db";
import { electionControls, electionLabels } from "../../../lib/election";
import { formatMalaysiaTime, scheduleValue } from "../../../lib/malaysia-time";
import { RefreshData } from "../../refresh-data";
import { AdminNav } from "../admin-nav";
import { BallotForm } from "../ballot-form";

export default async function LaunchPage() {
  if (!await currentAdmin()) redirect("/admin/login");
  const election = await activeElection();
  if (!election) return <p>Tiada pilihan raya.</p>;
  const ballots = await prisma.ballot.count({ where: { electionId: election.id } });
  const controls = electionControls(election, ballots);

  return (
    <>
      <AdminNav current="/admin/launch" />
      <RefreshData />
      <section className="card">
        <h2 className="font-bold">Status: {electionLabels[controls.status]}</h2>
        <p className="mut my-2">Pengundi hanya boleh mengundi ketika status Sedang dibuka.</p>
        {election.startsAt && <p>Mula: <time dateTime={election.startsAt.toISOString()}>{formatMalaysiaTime(election.startsAt)}</time></p>}
        {election.endsAt && <p>Tamat: <time dateTime={election.endsAt.toISOString()}>{formatMalaysiaTime(election.endsAt)}</time></p>}
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {controls.canOpen && <BallotForm electionId={election.id} action="election-open" label="Buka undian sekarang" plain
            confirmText="Buka undian sekarang? Struktur ballot akan dikunci." />}
          {controls.canClose && <BallotForm electionId={election.id} action="election-close" label="Tutup undian" plain
            confirmText="Tutup undian sekarang?" />}
          {controls.canReset && <BallotForm electionId={election.id} action="election-draft" label="Kembali ke draf" plain
            confirmText="Kembali ke draf dan kosongkan jadual undian?" />}
        </div>
      </section>
      {controls.canSchedule && <section className="card">
        <h2 className="font-bold">Jadualkan</h2>
        <p className="mut my-2">Waktu Malaysia (Asia/Kuala Lumpur)</p>
        <BallotForm electionId={election.id} action="election-schedule" label="Simpan jadual">
          <label>Mula<input type="datetime-local" name="startsAt" step={1} defaultValue={scheduleValue(election.startsAt)} required /></label>
          <label>Tamat<input type="datetime-local" name="endsAt" step={1} defaultValue={scheduleValue(election.endsAt)} required /></label>
        </BallotForm>
      </section>}
    </>
  );
}
