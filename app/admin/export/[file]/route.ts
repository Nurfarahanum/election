import { z } from "zod";
import { currentAdmin } from "../../../../lib/admin-auth";
import { activeElection, auditAdmin } from "../../../../lib/admin-election";
import { prisma } from "../../../../lib/db";
import { csv, download } from "../../../../lib/downloads";
import { electionResults } from "../../../../lib/election-results";
import { resultsPdf } from "../../../../lib/documents";
import { scheduleValue } from "../../../../lib/malaysia-time";

const files = z.enum(["keputusan.csv", "keputusan.pdf", "pengundi.csv", "log-audit.csv"]);
const csvType = "text/csv; charset=utf-8";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = files.safeParse((await params).file);
  if (!file.success) return new Response(null, { status: 404 });
  const admin = await currentAdmin();
  if (!admin) return new Response(null, { status: 401 });
  const election = await activeElection();
  if (!election) return new Response(null, { status: 404 });

  let response: Response;
  if (file.data === "pengundi.csv") {
    const voters = await prisma.voter.findMany({
      where: { electionId: election.id }, orderBy: { code: "asc" },
      select: { code: true, name: true, email: true, hasVoted: true, votedAt: true },
    });
    response = download(file.data, csv([
      ["ID Pengundi", "Nama", "Emel", "Status", "Masa mengundi (MYT)"],
      ...voters.map(voter => [voter.code, voter.name, voter.email, voter.hasVoted ? "Sudah mengundi" : "Belum mengundi",
        voter.votedAt ? scheduleValue(voter.votedAt) + "+08:00" : ""]),
    ]), csvType);
  } else if (file.data === "log-audit.csv") {
    const logs = await prisma.auditLog.findMany({
      where: { electionId: election.id }, orderBy: [{ at: "desc" }, { id: "desc" }],
      select: { at: true, actor: true, action: true, detail: true },
    });
    response = download(file.data, csv([
      ["Masa (MYT)", "Pelaku", "Tindakan", "Butiran"],
      ...logs.map(log => [scheduleValue(log.at) + "+08:00", log.actor, log.action,
        log.action === "VOTE_SUBMITTED" ? "" : JSON.stringify(log.detail)]),
    ]), csvType);
  } else {
    const view = await electionResults(election.id, "admin");
    if (!view?.results) return new Response("Keputusan calon masih disembunyikan.", {
      status: 403, headers: { "Cache-Control": "private, no-store" },
    });
    if (file.data === "keputusan.pdf") {
      response = download(file.data, await resultsPdf(election.orgName, election.name, view.turnout, view.results), "application/pdf");
    } else {
      const { eligible, voted } = view.turnout;
      response = download(file.data, csv([
        ["Jawatan", "Calon", "Undi", "Mendahului", "Seri", "Seri pada ambang", "Pengundi berdaftar", "Sudah mengundi"],
        ...view.results.flatMap(position => [
          ...position.candidates.map(candidate => [position.title, candidate.name, candidate.votes,
            candidate.leading ? "Ya" : "", candidate.tied ? "Ya" : "", candidate.cutoffTie ? "Ya" : "", eligible, voted]),
          [position.title, "(Tidak mengundi)", position.abstentions, "", "", "", eligible, voted],
        ]),
      ]), csvType);
    }
  }

  await auditAdmin(prisma, election.id, admin.id, "FILE_EXPORT", { file: file.data });
  return response;
}
