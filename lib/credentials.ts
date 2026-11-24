import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

export const emailSchema = z.string().trim().max(254).email().toLowerCase();
export const passwordSchema = z.string().min(12).max(256);

export function hashCredential(value: string) {
  return hash(value, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export function verifyCredential(encoded: string, value: string) {
  return verify(encoded, value);
}
