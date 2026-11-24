import Image from "next/image";
import { redirect } from "next/navigation";
import { currentAdmin } from "../../lib/admin-auth";
import { activeElection } from "../../lib/admin-election";
import { prisma } from "../../lib/db";
import { ballotLocked, effectiveStatus, electionLabels } from "../../lib/election";
import { AdminNav } from "./admin-nav";
import { BallotForm, PhotoInput } from "./ballot-form";

export default async function Admin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  const election = await activeElection();
  if (!election) return <p>Tiada pilihan raya.</p>;

  const [positions, totalBallots] = await Promise.all([
    prisma.position.findMany({
      where: { electionId: election.id }, orderBy: { sortOrder: "asc" },
      include: { candidates: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.ballot.count({ where: { electionId: election.id } }),
  ]);
  const now = new Date();
  const locked = ballotLocked(election, totalBallots, now);

  return (
    <>
      <AdminNav current="/admin" />
      <h2 className="sr-only">Ballot</h2>
      <p className="mut mb-4">{locked
        ? "Ballot dikunci kerana undian sudah dibuka atau ada undi masuk."
        : "Tambah jawatan dan calon. Ballot dikunci sebaik undian dibuka."}</p>
      <section className="card">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="grow font-bold">Tetapan pilihan raya</h3>
          <span className="chip">Status: {electionLabels[effectiveStatus(election, now)]}</span>
        </div>
        <BallotForm key={JSON.stringify([election.name, election.orgName])} electionId={election.id} action="election-update" label="Simpan">
            <label>Nama organisasi<input name="orgName" defaultValue={election.orgName} maxLength={120} required /></label>
            <label>Tajuk pilihan raya<input name="name" defaultValue={election.name} maxLength={120} required /></label>
        </BallotForm>
      </section>

      {positions.map((position) => (
        <section className="card" key={position.id}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="grow font-bold">{position.title}</h3>
            <span className="chip">Pilih {position.maxChoices}</span>
            {!locked && <BallotForm electionId={election.id} action="position-remove" target={{ name: "positionId", id: position.id }}
              label="Buang jawatan" plain confirmText={`Buang jawatan ${position.title} dan semua calonnya?`} />}
          </div>
          {!locked && <details className="mt-2">
            <summary>Ubah jawatan</summary>
            <BallotForm key={JSON.stringify([position.title, position.maxChoices])} electionId={election.id} action="position-update"
              target={{ name: "positionId", id: position.id }} label="Simpan jawatan">
              <label>Nama jawatan<input name="title" defaultValue={position.title} maxLength={120} required /></label>
              <label>Bilangan dipilih<input name="maxChoices" type="number" min={1} max={2147483647} defaultValue={position.maxChoices} required /></label>
            </BallotForm>
          </details>}
          <ul className="mt-2.5">
            {position.candidates.map((candidate) => (
              <li className="border-t border-[var(--line)] py-2" key={candidate.id}>
                <div className="flex items-center gap-3">
                  {candidate.photoPath ? <Image src={candidate.photoPath} alt={`Foto ${candidate.name}`} width={56} height={56} unoptimized
                    className="h-14 w-14 shrink-0 rounded-full object-cover" />
                    : <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--soft)] font-bold text-[var(--mut)]">
                      {candidate.name.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("")}
                    </span>}
                  <div><b>{candidate.name}</b><p className="mut whitespace-pre-wrap">{candidate.bio}</p></div>
                </div>
                {!locked && <details className="mt-2">
                  <summary>Ubah calon, {candidate.name}</summary>
                  <BallotForm key={JSON.stringify([candidate.name, candidate.bio, candidate.photoPath])}
                    electionId={election.id} action="candidate-update" target={{ name: "candidateId", id: candidate.id }} label="Simpan calon">
                    <label>Nama calon<input name="name" defaultValue={candidate.name} maxLength={120} required /></label>
                    <label>Bio ringkas<textarea name="bio" defaultValue={candidate.bio} maxLength={1000} /></label>
                    <PhotoInput />
                  </BallotForm>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {candidate.photoPath && <BallotForm electionId={election.id} action="candidate-photo-remove"
                      target={{ name: "candidateId", id: candidate.id }} label="Buang foto" plain />}
                    <BallotForm electionId={election.id} action="candidate-remove" target={{ name: "candidateId", id: candidate.id }}
                      label="Buang calon" plain confirmText={`Buang calon ${candidate.name}?`} />
                  </div>
                </details>}
              </li>
            ))}
            {!position.candidates.length && <li className="mut border-t border-[var(--line)] py-2">Belum ada calon.</li>}
          </ul>
          {!locked && <BallotForm electionId={election.id} action="candidate-add" target={{ name: "positionId", id: position.id }} label="Tambah calon">
            <label>Nama calon<input name="name" placeholder="Nama calon" maxLength={120} required /></label>
            <label>Bio ringkas<textarea name="bio" placeholder="Bio ringkas" maxLength={1000} /></label>
            <PhotoInput />
          </BallotForm>}
        </section>
      ))}
      {!locked && <section className="card">
        <h3 className="font-bold">Jawatan baharu</h3>
        <BallotForm electionId={election.id} action="position-add" label="Tambah jawatan">
          <label>Nama jawatan<input name="title" placeholder="Nama jawatan" maxLength={120} required /></label>
          <label>Bilangan dipilih<input name="maxChoices" type="number" min={1} max={2147483647} defaultValue={1} required /></label>
        </BallotForm>
      </section>}
    </>
  );
}
