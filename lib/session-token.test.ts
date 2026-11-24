import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readSessionId, signSession } from "./session-token";

describe("admin session signatures", () => {
  it("accepts a signed session ID", () => {
    const id = randomUUID();
    expect(readSessionId(signSession(id, "test-secret"), "test-secret")).toBe(id);
  });

  it("rejects malformed tokens and valid-length signatures on another ID", () => {
    const id = randomUUID();
    const token = signSession(id, "test-secret");
    expect(readSessionId(token.replace(id, randomUUID()), "test-secret")).toBeNull();
    expect(readSessionId(token, "another-secret")).toBeNull();
    expect(readSessionId(`${token}.extra`, "test-secret")).toBeNull();
    expect(readSessionId(`${id}.é`, "test-secret")).toBeNull();
  });
});
