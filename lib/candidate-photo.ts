import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { AdminInputError } from "./admin-election";

export const photoDirectory = () => process.env.CANDIDATE_PHOTO_DIR ?? join(process.cwd(), ".candidate-photos");
const photoPrefix = "/media/candidates/";
const logoPrefix = "/media/branding/";
const filenamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export async function preparePhoto(file: File, logo = false) {
  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new AdminInputError("Saiz foto mestilah antara 1 bait hingga 5 MB.");
  }
  const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000 });
  try {
    const { format } = await image.metadata();
    if (!format || !["jpeg", "png", "webp"].includes(format)) throw new Error("Unsupported format");
    return await image.autoOrient().resize(400, 400, {
      fit: logo ? "inside" : "cover", position: "centre", withoutEnlargement: logo,
    }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new AdminInputError("Gunakan foto JPEG, PNG atau WebP yang sah.");
  }
}

export async function savePhoto(data: Buffer, logo = false) {
  const filename = `${randomUUID()}.webp`;
  await mkdir(photoDirectory(), { recursive: true });
  await writeFile(join(photoDirectory(), filename), data, { flag: "wx", mode: 0o600 });
  return `${logo ? logoPrefix : photoPrefix}${filename}`;
}

export async function deletePhoto(path: string | null) {
  const prefix = [photoPrefix, logoPrefix].find(value => path?.startsWith(value));
  if (!path || !prefix) return;
  const filename = path.slice(prefix.length);
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
