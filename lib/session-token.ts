import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

function signature(id: string, secret: string) {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

export function signSession(id: string, secret: string) {
  return `${id}.${signature(id, secret)}`;
}

export function readSessionId(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 2 || !z.uuid().safeParse(parts[0]).success || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) {
    return null;
  }
  return timingSafeEqual(Buffer.from(parts[1]), Buffer.from(signature(parts[0], secret))) ? parts[0] : null;
}
