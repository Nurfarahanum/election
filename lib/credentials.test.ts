import { expect, it } from "vitest";
import { hashCredential, verifyCredential } from "./credentials";

it("stores an Argon2id hash and verifies only the matching credential", async () => {
  const password = "a test password long enough";
  const encoded = await hashCredential(password);
  expect(encoded).toMatch(/^\$argon2id\$/);
  expect(encoded).not.toContain(password);
  expect(await verifyCredential(encoded, password)).toBe(true);
  expect(await verifyCredential(encoded, "the wrong credential")).toBe(false);
});
