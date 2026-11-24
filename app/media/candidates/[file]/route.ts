import { prisma } from "../../../../lib/db";
import { loadPhoto } from "../../../../lib/candidate-photo";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const candidate = await prisma.candidate.findFirst({
    where: { photoPath: `/media/candidates/${file}` }, select: { id: true },
  });
  const image = candidate ? await loadPhoto(file) : null;
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "no-cache" },
  });
}
