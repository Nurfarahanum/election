import { redirect } from "next/navigation";
import { currentAdmin } from "../../lib/admin-auth";
import { prisma } from "../../lib/db";

const labels = { DRAFT: "Draf", SCHEDULED: "Dijadualkan", OPEN: "Sedang dibuka", CLOSED: "Ditutup" };

export default async function Admin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  const election = await prisma.election.findFirst({
    orderBy: { createdAt: "desc" },
    select: { name: true, status: true, positions: { orderBy: { sortOrder: "asc" }, include: { candidates: { orderBy: { sortOrder: "asc" } } } } },
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <h2 className="text-lg font-bold">Ballot</h2>
        <form method="post" action="/admin/logout">
          <button className="btn" type="submit">Keluar</button>
        </form>
      </div>
      {election && (
        <>
          <div className="card">
            <h3 className="font-bold">{election.name}</h3>
            <p className="mut">Status: {labels[election.status]}</p>
          </div>
          {election.positions.map((position) => (
            <section className="card" key={position.id}>
              <h3 className="font-bold">{position.title} <span className="chip">Pilih {position.maxChoices}</span></h3>
              <ul className="mt-2.5">
                {position.candidates.map((candidate) => (
                  <li className="border-t border-[var(--line)] py-2" key={candidate.id}>
                    <p className="font-semibold">{candidate.name}</p>
                    <p className="mut">{candidate.bio}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
