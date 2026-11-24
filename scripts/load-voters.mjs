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
    ...options, method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, key }),
  });
  assert.equal(login.status, 303, `${code} login status`);
  assert.equal(login.headers.get("location"), "/vote", `${code} login redirect`);
  const cookie = login.headers.getSetCookie().find(value => value.startsWith("__Host-kopetro-voter="))?.split(";")[0];
  assert(cookie, `${code} session missing`);
  await login.arrayBuffer();
  const afterLogin = performance.now();

  const ballot = await fetch(origin + "/vote", { ...options, headers: { Cookie: cookie } });
  assert.equal(ballot.status, 200, `${code} ballot status`);
  assert.match(await ballot.text(), /Calon Beban/, `${code} ballot`);
  const afterBallot = performance.now();
  const vote = await fetch(origin + "/vote/submit", {
    ...options, method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify([{ positionId, candidateIds: [candidateId] }]),
  });
  assert.equal(vote.status, 200, `${code} vote status`);
  assert.deepEqual(await vote.json(), { ok: true });
  const afterVote = performance.now();
  const confirmation = await fetch(origin + "/vote", { ...options, headers: { Cookie: cookie } });
  assert.equal(confirmation.status, 200, `${code} receipt status`);
  assert.match(await confirmation.text(), /Undi anda telah direkodkan/, `${code} receipt`);
  return {
    login: afterLogin - start, ballot: afterBallot - afterLogin,
    vote: afterVote - afterBallot, receipt: performance.now() - afterVote,
    total: performance.now() - start,
  };
}

// Voters arrive at the sign-in page before sending credentials. Time from that submission.
await Promise.all(Array.from({ length: count }, async () => {
  const response = await fetch(origin + "/vote", { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
}));
const settled = await Promise.allSettled(Array.from({ length: count }, (_, index) => flow(index)));
const errors = settled.filter(result => result.status === "rejected");
const completed = settled.filter(result => result.status === "fulfilled").map(result => result.value);
const summary = { voters: count, errors: errors.length, p95Ms: Object.fromEntries(
  ["login", "ballot", "vote", "receipt", "total"].map(phase => {
    const values = completed.map(result => result[phase]).sort((a, b) => a - b);
    return [phase, values.length ? Math.round(values[Math.ceil(values.length * 0.95) - 1]) : null];
  }),
) };
console.log(JSON.stringify(summary));
for (const error of errors.slice(0, 5)) console.error(error.reason?.message ?? "Request failed");
assert.equal(errors.length, 0);
assert(summary.p95Ms.total < 2000, "Full voter flow p95 must be under 2 seconds.");
