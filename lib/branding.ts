import { z } from "zod";
import { auditAdmin, withElectionLock } from "./admin-election";
import { deletePhoto, preparePhoto, savePhoto } from "./candidate-photo";
import { prisma } from "./db";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const brandingCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("branding-update"), primaryColor: hex, logo: z.file().optional() }),
  z.object({ action: z.literal("branding-reset") }),
]);

export function brandingStyle(value: string | null | undefined) {
  const color = hex.safeParse(value).data;
  if (!color) return null;
  const channels = [1, 3, 5].map(index => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const light = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return `[data-brand="${color}"]{--acc:${color};--on:${light > 0.179 ? "#000" : "#fff"}}`;
}

export async function changeBranding(electionId: string, adminId: string, command: z.infer<typeof brandingCommand>) {
  const reset = command.action === "branding-reset";
  const upload = !reset && command.logo?.name ? await savePhoto(await preparePhoto(command.logo, true), true) : null;
  try {
    const old = await withElectionLock(electionId, async (tx, election) => {
      await tx.election.update({ where: { id: electionId }, data: {
        primaryColor: reset ? null : command.primaryColor,
        logoPath: reset ? "/kopetro.png" : upload ?? election.logoPath,
      } });
      await auditAdmin(tx, electionId, adminId, reset ? "BRANDING_RESET" : "BRANDING_UPDATE",
        reset ? {} : { primaryColor: command.primaryColor, logoChanged: Boolean(upload) });
      return election.logoPath;
    });
    if (reset || upload) await deletePhoto(old);
  } catch (error) {
    if (upload) {
      try {
        const reference = await prisma.election.findFirst({ where: { logoPath: upload }, select: { id: true } });
        if (!reference) await deletePhoto(upload);
      } catch {
        console.error("Could not check branding image reference.");
      }
    }
    throw error;
  }
}
