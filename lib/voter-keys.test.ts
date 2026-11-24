import { expect, it } from "vitest";
import { verifyCredential } from "./credentials";
import { issueVoterKey } from "./voter-keys";

it("issues eight unambiguous characters and an Argon2id verifier", async () => {
  const { key, keyHash } = await issueVoterKey();
  expect(key).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  expect(keyHash).toMatch(/^\$argon2id\$/);
  expect(await verifyCredential(keyHash, key)).toBe(true);
});
