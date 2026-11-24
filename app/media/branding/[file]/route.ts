import { activeElection } from "../../../../lib/admin-election";
import { loadPhoto } from "../../../../lib/candidate-photo";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const election = await activeElection();
  const image = election?.logoPath === `/media/branding/${file}` ? await loadPhoto(file) : null;
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "no-cache" },
  });
}
