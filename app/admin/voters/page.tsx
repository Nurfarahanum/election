import { redirect } from "next/navigation";
import { currentAdmin } from "../../../lib/admin-auth";
import { activeElection } from "../../../lib/admin-election";
import { prisma } from "../../../lib/db";
import { AdminNav } from "../admin-nav";
import { VoterManager } from "./voter-manager";

export default async function VotersPage() {
  if (!await currentAdmin()) redirect("/admin/login");
  const election = await activeElection();
  if (!election) return <p>Tiada pilihan raya.</p>;
  const voters = await prisma.voter.findMany({
    where: { electionId: election.id },
    select: { id: true, code: true, name: true, email: true, hasVoted: true },
    orderBy: [{ code: "asc" }],
  });
  return (
    <>
      <AdminNav current="/admin/voters" />
      <h2 className="sr-only">Pengundi</h2>
      <VoterManager key={election.id} electionId={election.id} voters={voters} />
    </>
  );
}
