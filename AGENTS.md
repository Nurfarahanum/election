# Kopetro AGM Online Voting System: Build Specification for Codex

## How to use this file

1. Create an empty repo. Put these three files in a `docs/` folder:
   - `kopetro-voting-spec.md` (this file)
   - `kopetro-undi-prototaip.html` (clickable UI prototype, the visual and copy reference)
   - `kopetro.png` (logo)
2. Copy this file's contents into `AGENTS.md` at the repo root so Codex reads it on every task.
3. Paste the **Starter prompt** below into Codex, then continue milestone by milestone.

### Starter prompt (paste into Codex)

> Read `AGENTS.md` and `docs/kopetro-undi-prototaip.html` fully. Build milestone M1 only (project scaffold, database schema, admin authentication, CI). Follow the stack, data model and security rules in AGENTS.md exactly. Do not start M2 until M1's acceptance checks pass. At the end, list what you built, what you skipped and any assumptions you made.

---

## 1. Goal

A secure, mobile-friendly online voting system for the **Kopetro AGM election**, modelled on Election Runner (electionrunner.com). About **200 voters**, one organisation, one election at a time. The admin builds a ballot, loads the voter list, launches the election, watches turnout and results, and exports the outcome. Voters log in with a unique Voter ID and Voter Key and vote once.

The UI language is **Bahasa Malaysia** by default. Reuse the copy in the prototype. Code, comments and docs are in English.

## 2. Scope

### In scope (v1)
- Admin login (email and password)
- Ballot builder: positions, candidates, photo and short bio, max selections per position
- Voter management: add one by one, import CSV or XLSX, regenerate a key, remove (only before voting)
- Voter login with ID and Key, one vote only, review screen before submit, confirmation screen
- Election states: draft, scheduled, open, closed. Server-side schedule in Asia/Kuala_Lumpur
- Email invitations and reminders (SMTP)
- Printable voter slips (PDF) for members without email
- Live turnout and results dashboard, publish results to voters, hide live results until close (setting)
- Exports: results CSV and PDF, voter list CSV, audit log CSV
- Audit log
- Branding: Kopetro logo and colours
- Docker deployment with HTTPS

### Out of scope (v1)
- Native mobile apps, multi-organisation (SaaS) support, payments
- Ranked-choice or weighted voting
- Proxy voting and quorum calculation (see Open questions)

## 3. Stack

Use this unless there is a strong reason not to, and explain any deviation in the PR.

- **Next.js (App Router) + TypeScript**, server actions or route handlers for the API
- **PostgreSQL** with **Prisma**
- **Auth:** own implementation with signed, httpOnly, SameSite=Lax cookies. Admin passwords hashed with **argon2id**. No third-party auth service
- **Validation:** zod on every input, server-side
- **Email:** nodemailer over SMTP, config from environment
- **Images:** `sharp` for server-side resize (square crop, 400×400, WebP or JPEG), stored on a mounted volume
- **PDF:** `pdf-lib` or `@react-pdf/renderer` for voter slips and results
- **Tests:** Vitest (unit), Playwright (end to end)
- **Deploy:** Dockerfile + `docker-compose.yml` (app, postgres, caddy for automatic HTTPS)
- **Style:** Tailwind CSS. Port the design tokens from the prototype (palette, spacing, dark mode)

## 4. Data model

```
Election
  id, name, orgName, status (DRAFT|SCHEDULED|OPEN|CLOSED),
  startsAt?, endsAt?, resultsPublished (bool), hideLiveResults (bool, default true),
  logoPath?, createdAt

Position
  id, electionId, title, maxChoices (int >= 1), sortOrder

Candidate
  id, positionId, name, bio, photoPath?, sortOrder

Voter
  id, electionId, code (e.g. "KP-001", unique per election),
  name, email?, keyHash, hasVoted (bool), votedAt?

Ballot                       -- anonymous, NO link to Voter
  id (random uuid), electionId

BallotChoice
  id, ballotId, positionId, candidateId

AuditLog
  id, electionId, at, actor (ADMIN:<id> | VOTER:<code> | SYSTEM), action, detail
```

### Ballot secrecy rules (critical)
- `Ballot` and `BallotChoice` must **never** contain a voter id, voter code, IP address, user agent or a precise timestamp. No column in these tables can be joined back to a voter.
- `Voter.votedAt` may be stored, but `Ballot` has no timestamp and rows are inserted with random UUIDs, so insertion order cannot be matched to `votedAt`. Do not add `createdAt` or auto-increment ids to Ballot tables.
- Abstain is represented by the **absence** of a `BallotChoice` for that position. Abstain counts are computed as `totalBallots - ballotsWithAChoiceForThatPosition`.
- Admins can see **who has voted**, never **how they voted**.

### Voter keys
- Generate a 6 to 8 character key from an unambiguous alphabet (no 0/O/1/I/L).
- Store only a hash (argon2id). The plaintext key is shown **once** at generation and in the one-time slip or email export. "Regenerate key" creates a new key and invalidates the old one.

## 5. Behaviour rules

**Election state machine**
- `DRAFT` → `SCHEDULED` (needs startsAt < endsAt) or `OPEN` (launch now)
- `SCHEDULED` → `OPEN` at startsAt, `OPEN` → `CLOSED` at endsAt or manual close
- Compute the effective state from the server clock on every request. Do not depend on a cron job
- Ballot structure (positions and candidates) is **locked** once the election is OPEN or any ballot exists. Voters can still be added while OPEN, but the audit log records it
- Return to DRAFT is allowed only if zero ballots exist

**Voting**
- Voter logs in with code + key (case-insensitive). Only when the effective state is OPEN
- Selections validated server-side: candidate belongs to position, count ≤ `maxChoices`, no duplicates
- Single-choice positions use radio buttons plus an explicit "Tidak mengundi" option. Multi-choice positions use checkboxes and empty means abstain
- Submit runs in **one database transaction**: `UPDATE Voter SET hasVoted = true, votedAt = now() WHERE id = ? AND hasVoted = false`. If zero rows were updated, abort with "sudah mengundi". Otherwise insert the Ballot and BallotChoice rows. This must be safe under concurrent submissions from the same voter
- After submit, show the confirmation screen and, if results are published, the results

**Results**
- Per candidate counts, abstain count per position, turnout (voted / eligible)
- Mark the top `maxChoices` candidates as leading. Flag ties for the admin
- If `hideLiveResults` is true, the admin sees only turnout until the election is CLOSED
- Voters see results only when `resultsPublished` is true and the election is CLOSED

## 6. Security requirements

- HTTPS only, HSTS, secure cookies, strict CSP, standard security headers
- CSRF protection on all state-changing requests
- Rate limiting on voter login and admin login: lock a voter code for 15 minutes after 5 failed attempts, and limit per IP. Use constant-time comparison for keys
- Generic error for a wrong ID or key ("ID atau Kunci tidak sepadan") so IDs cannot be enumerated
- All input validated with zod, all output escaped, parameterised queries only (Prisma)
- Upload limits: images only, max 5 MB, re-encoded by sharp (never serve the original file)
- Admin password policy (12+ characters). Optional TOTP 2FA for admin (nice to have, behind a flag)
- Secrets only from environment variables. Provide `.env.example`
- Every admin action and every vote event (voter code only, never the choices) is written to AuditLog
- Nightly database backup script plus a documented restore procedure

## 7. Screens

Match the prototype's layout, copy and tokens. Admin has tabs: **Ballot, Pengundi, Pelancaran, Keputusan, Log audit**. Voter flow: **Log masuk → Undi → Semak → Selesai**. Add these that the prototype lacks:

- Admin login page and "Tukar kata laluan"
- Voter list actions: "Jana semula kunci", "Muat turun slip PDF", "Hantar emel jemputan", "Hantar peringatan (belum mengundi)"
- CSV/XLSX import with a preview table, per-row validation errors and a duplicate check
- Real CSV and PDF downloads (the prototype only displays text)
- Photo upload with crop preview
- Branding settings: logo upload and primary colour

**Accessibility:** WCAG 2.1 AA, full keyboard use, visible focus, labels on every input, sensible contrast in both light and dark mode, respect `prefers-reduced-motion`.

**Mobile first:** most voters will use phones. Test at 360 px width.

## 8. Milestones and acceptance checks

**M1: Scaffold and auth.** Repo, Docker compose, Prisma schema and migrations, admin login/logout, seed script (demo election with the prototype's data), CI (lint, typecheck, test).
- *Accept:* `docker compose up` gives a working app; admin can log in; CI is green.

**M2: Ballot builder and voter management.** Positions, candidates, photos, max choices, lock rules, add/import/remove voters, key generation and hashing, one-time key reveal.
- *Accept:* import a 200-row CSV with bad rows and see per-row errors; plaintext keys are not in the database.

**M3: Voter flow.** Login, ballot, review, atomic submit, confirmation, rate limiting.
- *Accept:* a concurrency test submitting the same voter's ballot 20 times in parallel produces exactly one ballot. Wrong keys lock the code after 5 attempts.

**M4: Launch, schedule, results, audit.** State machine, schedule, live turnout, results with leading and tie flags, publish toggle, audit log.
- *Accept:* a scheduled election opens and closes at the right server time with no manual action. Voters cannot vote outside OPEN.

**M5: Email, slips, exports.** SMTP invitations and reminders, voter slip PDF (one card per voter with ID, key, URL), results CSV/PDF, voter and audit CSV.
- *Accept:* a test SMTP inbox (e.g. Mailpit) receives the invitations. Slip PDF for 200 voters generates in under 30 seconds.

**M6: Hardening and deploy.** Security headers, backup script, README with VPS deployment steps, Playwright end-to-end suite, load test.
- *Accept:* end-to-end flow passes (admin builds ballot, imports voters, opens, 3 voters vote, close, publish, voter sees results). A load test with 200 concurrent voters completes with no errors and p95 under 2 seconds.

## 9. Test requirements

- Unit tests: tally logic (including abstain, ties, multi-seat), selection validation, state machine, key generation
- Integration tests: atomic double-vote protection, ballot secrecy (a schema test asserting Ballot/BallotChoice have no voter reference columns)
- Playwright end-to-end for admin and voter flows on a mobile viewport

## 10. Open questions for Kopetro (confirm before M4)

1. Does the AGM allow **proxy voting** (undi proksi)? If yes, a voter may need to carry more than one vote.
2. Is there a **quorum** requirement that the system should display?
3. Should results be visible to the admin **live**, or hidden until the election closes? (Default: hidden.)
4. Who can be **admin**? One account or several (e.g. returning officer and an auditor)?
5. Will the election run **only online during the AGM**, or also for a window before it? (Affects the schedule and reminder emails.)
6. Do all voters have an email address on file, or do many need printed slips?
7. Where will it be hosted (Malaysian VPS or cloud provider), and who maintains it after the AGM?

## 11. Definition of done (v1)

All milestones' acceptance checks pass, the end-to-end suite is green in CI, the README explains deployment and backup, no secrets are committed, and the open questions above have recorded answers.
