import { redirect } from "next/navigation";
import { currentAdmin } from "../../../lib/admin-auth";
import { activeElection } from "../../../lib/admin-election";
import { AdminNav } from "../admin-nav";
import { BallotForm } from "../ballot-form";

export default async function BrandingPage() {
  if (!await currentAdmin()) redirect("/admin/login");
  const election = await activeElection();
  if (!election) return <p>Tiada pilihan raya.</p>;
  return (
    <>
      <AdminNav current="/admin/branding" />
      <section className="card" aria-labelledby="brand-heading">
        <h2 className="font-bold" id="brand-heading">Penjenamaan</h2>
        <BallotForm electionId={election.id} action="branding-update" label="Simpan penjenamaan"
          key={JSON.stringify([election.primaryColor, election.logoPath])}>
          <label>Warna utama<input type="color" name="primaryColor" defaultValue={election.primaryColor ?? "#12303b"} /></label>
          <label>Logo organisasi<input type="file" name="logo" accept="image/jpeg,image/png,image/webp" /></label>
        </BallotForm>
        <p className="mut my-2">Logo JPEG, PNG atau WebP, maksimum {process.env.VERCEL === "1" ? 4 : 5} MB.</p>
        <BallotForm electionId={election.id} action="branding-reset" label="Pulihkan penjenamaan lalai" plain />
      </section>
    </>
  );
}
