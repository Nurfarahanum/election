import { redirect } from "next/navigation";
import { currentAdmin } from "../../../lib/admin-auth";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ ralat?: string }> }) {
  if (await currentAdmin()) redirect("/admin");
  const failed = (await searchParams).ralat === "1";

  return (
    <section className="card mx-auto my-6 max-w-[420px]" aria-labelledby="login-title">
      <h2 id="login-title" className="text-lg font-bold">Log masuk admin</h2>
      {failed && <p className="mt-2 font-semibold text-[var(--bad)]" role="alert">Log masuk gagal. Semak emel dan kata laluan atau cuba lagi kemudian.</p>}
      <form method="post" action="/admin/session" className="mt-3 grid gap-3">
        <label className="grid gap-1">
          Emel
          <input name="email" type="email" autoComplete="username" required maxLength={254} />
        </label>
        <label className="grid gap-1">
          Kata laluan
          <input name="password" type="password" autoComplete="current-password" required maxLength={256} />
        </label>
        <button className="btn" type="submit">Log masuk</button>
      </form>
    </section>
  );
}
