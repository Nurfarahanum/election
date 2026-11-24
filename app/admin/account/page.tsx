import { redirect } from "next/navigation";
import { currentAdmin } from "../../../lib/admin-auth";
import { AdminNav } from "../admin-nav";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ralat?: string }> }) {
  if (!await currentAdmin()) redirect("/admin/login");
  const failed = (await searchParams).ralat === "1";
  return (
    <>
      <AdminNav current="/admin/account" />
      <section className="card mx-auto max-w-[420px]" aria-labelledby="password-heading">
        <h2 className="text-lg font-bold" id="password-heading">Tukar kata laluan</h2>
        {failed && <p className="form-error mt-2" role="alert">Semak kata laluan semasa dan kedua-dua kata laluan baharu, atau cuba lagi kemudian.</p>}
        <form method="post" action="/admin/account/password" className="mt-3 grid gap-3">
          <label className="grid gap-1">Kata laluan semasa
            <input name="current" type="password" autoComplete="current-password" required maxLength={256} />
          </label>
          <label className="grid gap-1">Kata laluan baharu
            <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
          </label>
          <label className="grid gap-1">Sahkan kata laluan baharu
            <input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={256} />
          </label>
          <p className="mut">Gunakan sekurang-kurangnya 12 aksara. Sesi admin akan ditamatkan selepas perubahan.</p>
          <button className="btn" type="submit">Simpan kata laluan</button>
        </form>
      </section>
    </>
  );
}
