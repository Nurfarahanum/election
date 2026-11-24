import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const origin = process.env.APP_ORIGIN ?? "https://localhost";
const key = "BENCH234";
const count = 200;
const positionId = "7195cc5e-c8e1-4efd-a1e5-51ad71977ae3";
const candidateId = "7195cc5e-c8e1-4efd-a1e5-51ad71977ae4";

async function flow(index) {
  const code = `LOAD-${String(index + 1).padStart(3, "0")}`;
  const start = performance.now();
  const options = { redirect: "manual", signal: AbortSignal.timeout(15000) };
  const login = await fetch(origin + "/vote/login", {
    ...options, method: "POST", headers: { Origin: origin, Accept: "application/json" },
    body: new URLSearchParams({ code, key }),
  });
  assert.equal(login.status, 200, `${code} login status`);
  const cookie = login.headers.getSetCookie().find(value => value.startsWith("__Host-kopetro-voter="))?.split(";")[0];
  assert(cookie, `${code} session missing`);
  const ballot = await login.json();
  assert.equal(ballot.positions[0]?.id, positionId, `${code} ballot`);
  assert.equal(ballot.positions[0]?.candidates[0]?.id, candidateId, `${code} candidate`);
  const afterLogin = performance.now();

  const vote = await fetch(origin + "/vote/submit", {
    ...options, method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify([{ positionId, candidateIds: [candidateId] }]),
  });
  assert.equal(vote.status, 200, `${code} vote status`);
  assert.deepEqual(await vote.json(), { ok: true });
  const afterVote = performance.now();
  return { cookie, loginAndBallot: afterLogin - start, vote: afterVote - afterLogin, total: afterVote - start };
}

// A voter opens the sign-in screen before entering credentials.
await Promise.all(Array.from({ length: count }, async () => {
  const response = await fetch(origin + "/vote", { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
}));
const settled = await Promise.allSettled(Array.from({ length: count }, (_, index) => flow(index)));
const errors = settled.filter(result => result.status === "rejected");
const completed = settled.filter(result => result.status === "fulfilled").map(result => result.value);
const summary = { voters: count, errors: errors.length, p95Ms: Object.fromEntries(
  ["loginAndBallot", "vote", "total"].map(phase => {
    const values = completed.map(result => result[phase]).sort((a, b) => a - b);
    return [phase, values.length ? Math.round(values[Math.ceil(values.length * 0.95) - 1]) : null];
  }),
) };
console.log(JSON.stringify(summary));
for (const error of errors.slice(0, 5)) console.error(error.reason?.message ?? "Request failed");
assert.equal(errors.length, 0);

// Reopening the page must show a durable receipt for every completed vote.
for (let offset = 0; offset < completed.length; offset += 20) {
  await Promise.all(completed.slice(offset, offset + 20).map(async ({ cookie }) => {
    const receipt = await fetch(origin + "/vote", {
      headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000),
    });
    assert.equal(receipt.status, 200);
    assert.match(await receipt.text(), /Undi anda telah direkodkan/);
  }));
}
assert(summary.p95Ms.total < 2000, "Full voter flow p95 must be under 2 seconds.");
