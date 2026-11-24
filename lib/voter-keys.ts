import { randomInt } from "node:crypto";
import { hashCredential } from "./credentials";

const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export async function issueVoterKey() {
  const key = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return { key, keyHash: await hashCredential(key) };
}
