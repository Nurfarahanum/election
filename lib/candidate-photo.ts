import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { AdminInputError } from "./admin-election";

export const photoDirectory = () => process.env.CANDIDATE_PHOTO_DIR ?? join(process.cwd(), ".candidate-photos");
const photoPrefix = "/media/candidates/";
const filenamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export async function preparePhoto(file: File) {
  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new AdminInputError("Saiz foto mestilah antara 1 bait hingga 5 MB.");
  }
  const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000 });
  try {
    const { format } = await image.metadata();
    if (!format || !["jpeg", "png", "webp"].includes(format)) throw new Error("Unsupported format");
    return await image.autoOrient().resize(400, 400, { fit: "cover", position: "centre" }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new AdminInputError("Gunakan foto JPEG, PNG atau WebP yang sah.");
  }
}

export async function savePhoto(data: Buffer) {
  const filename = `${randomUUID()}.webp`;
  await mkdir(photoDirectory(), { recursive: true });
  await writeFile(join(photoDirectory(), filename), data, { flag: "wx", mode: 0o600 });
  return `${photoPrefix}${filename}`;
}

export async function deletePhoto(path: string | null) {
  if (!path?.startsWith(photoPrefix)) return;
  const filename = path.slice(photoPrefix.length);
  if (!filenamePattern.test(filename)) return;
  try {
    await unlink(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ photoDirectory(), filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Candidate photo cleanup failed.");
  }
}

export async function loadPhoto(filename: string) {
  if (!filenamePattern.test(filename)) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ photoDirectory(), filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
