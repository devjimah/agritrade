# AgriTrade Milestone 10 — Farmer Self-Service Portal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Also required:** This plan touches financial/inventory business rules. Every task that adds a mutation MUST go through the builder → reviewer loop described in `CLAUDE.md` (2-agent workflow) before being marked done — dispatch a Reviewer subagent, apply findings, re-review, only then commit.

**Goal:** Let a farmer log in with their phone number and a trader-assigned PIN to view their own advances, repayment history, and running balance, and to submit a repayment claim ("I delivered N bags against advance X") that a trader must confirm before it becomes a real, ledger-affecting repayment.

**Why this is a new milestone, not a bugfix:** AgriTrade was designed single-sided — `IUser` has only `"admin" | "staff"`, and `IFarmer`/`ICustomer` are records the trader manages, not principals that authenticate. This plan adds a second, parallel principal type (a farmer) with its own auth, its own scoped read API, and exactly one new mutation: submitting a claim that a trader must confirm. It does not touch the existing farmer-management, advance, or repayment code paths — it wraps them.

## Non-negotiable design constraints

1. **The existing `createRepayment` service is untouched and remains the only path that mutates `bagsRepaid`, inventory, or the ledger.** A farmer's claim never calls it directly. Only `POST /api/repayment-claims/:id/confirm` (staff-authed) calls it, and only after the claim is loaded and validated.
2. **A farmer claim is inert data until confirmed.** No inventory, ledger, or advance-status side effects exist between "farmer submits" and "trader confirms." This is the one property every reviewer pass on this plan must re-verify.
3. **Farmer auth is a fully separate JWT scope from staff auth.** A farmer token must never satisfy `requireAuth` (staff), and a staff token must never satisfy the new `requireFarmerAuth`. Different `JwtPayload` shape (`{ sub, scope: "farmer" }` vs `{ sub, role }`), and the farmer-portal routes must reject a staff token and vice versa — write a test for both directions.
4. **A farmer can only ever see/act on their own data.** Every farmer-portal query is implicitly scoped to `req.farmer.id`; there is no farmer-supplied `farmerId` parameter anywhere in this API surface.
5. **PINs are hashed like passwords** (bcrypt, same `hashPassword`/`comparePassword` utils already in `server/src/utils/password.ts` — do not invent a second hashing scheme). Never logged, never returned in any response.
6. **No SMS/OTP in this milestone** (explicit user decision: trader-assigned PIN). Do not add an SMS provider dependency.
7. **Money/crop conventions from the rest of the codebase apply unchanged**: integer pesewas, `CROP_TYPES` enum, `formatGHS`/`parseGHSToPesewas` reused on the client, no client-side aggregation of figures the server already computes (reuse `getFarmerAdvanceSummary`).

## Architecture

**New collection:** `repayment_claims`
```ts
interface IRepaymentClaim {
  advanceId: Types.ObjectId;
  farmerId: Types.ObjectId; // denormalized for the farmer-scoped list query
  bagsClaimed: number;
  status: "pending" | "confirmed" | "rejected";
  claimedAt: Date; // = createdAt, but explicit for clarity in payloads
  reviewedBy?: Types.ObjectId; // staff user who confirmed/rejected
  reviewedAt?: Date;
  rejectionReason?: string;
  resultingRepaymentId?: Types.ObjectId; // set on confirm, links to the real FarmerRepayment
  idempotencyKey: string; // farmer's client-generated key, unique index (rule 7: no duplicate claims)
}
```

**New field on `IFarmer`:** `pinHash?: string` (`select: false`, like `passwordHash` on `IUser`). Optional because existing farmers have none until a trader sets one.

**New JWT payload variant:** add a discriminant so `verifyToken` output can't be confused between principals:
```ts
export type JwtPayload =
  | { sub: string; role: UserRole } // staff (existing, unchanged shape)
  | { sub: string; scope: "farmer" }; // new
```
`signToken`/`verifyToken` become generic over this union; `requireAuth` narrows to the staff variant and 401s on a farmer token, `requireFarmerAuth` narrows to the farmer variant and 401s on a staff token.

**New middleware:** `requireFarmerAuth` (mirrors `requireAuth` in `server/src/middleware/auth.ts`) — verifies the token, narrows to `scope === "farmer"`, loads the `FarmerModel` doc, sets `req.farmer = { id }`.

**New routes**, all under `/api/farmer-portal`, split into public (login) and farmer-authed:
- `POST /api/farmer-portal/login` — `{ phone, pin }` → `{ token }`. Rate-limited like staff login (10/min), same timing-safe-on-unknown-phone pattern as `auth.service.ts`'s `login`.
- `GET /api/farmer-portal/me` — farmer's own profile (name, phone, village) minus `pinHash`.
- `GET /api/farmer-portal/advances` — farmer's own advances + summary (delegates to existing `listAdvances({ farmerId: req.farmer.id })` and `getFarmerAdvanceSummary`, both already correct).
- `GET /api/farmer-portal/repayments` — farmer's own repayment history (delegates to existing `listRepayments`).
- `POST /api/farmer-portal/repayment-claims` — `{ advanceId, bagsClaimed, idempotencyKey }`. Validates `advanceId` belongs to `req.farmer.id` (404 otherwise — never leak another farmer's advance via a 403 vs 404 distinction). Validates `bagsClaimed <= expectedBags - bagsRepaid` the same way `createRepayment`'s pre-check does (friendly error), but writes ONLY a claim doc — no transaction needed since nothing else mutates.
- `GET /api/farmer-portal/repayment-claims` — farmer's own claims with status.

**New staff-side routes** (staff-authed, existing `requireAuth`), under `/api/repayment-claims`:
- `GET /api/repayment-claims?status=pending` — trader's queue.
- `POST /api/repayment-claims/:id/confirm` — loads the claim (404 if missing/not pending), calls the existing `createRepayment` service with the claim's `advanceId`/`bagsClaimed`, on success marks the claim `confirmed` + `resultingRepaymentId`. **If `createRepayment` throws (e.g. someone else already repaid enough in the meantime), the claim stays `pending` and the error surfaces to the trader** — do not silently reject it.
- `POST /api/repayment-claims/:id/reject` — `{ reason }` → marks `rejected`, no side effects.

**New client surface:** a second route tree in the existing app, e.g. `/portal/*`, with its own tiny auth context (`FarmerAuthContext`, mirrors `AuthContext` but stores under a different localStorage key, e.g. `agritrade_farmer_token`, so a farmer session and a staff session can coexist in the same browser without clobbering each other) — `/portal/login`, `/portal` (dashboard: balance + advances), `/portal/claims` (submit + history). Plus one new staff-side page, `/repayment-claims`, for the trader's confirm/reject queue, linked from nav.

## Global constraints (from the base plan, still in force)

- Response envelope everywhere: `{ success: true, data }` / `{ success: false, error }`.
- Business logic lives in `server/src/services/`, not controllers.
- Windows/PowerShell environment; MongoDB replica set required (existing `db:dev` script) — this milestone adds no new transactions itself (claims are non-transactional single-doc writes; confirmation reuses the existing transactional service), but the dev DB must already be up per the README.
- Commit after every task with a conventional-commit message, ONLY after that task's reviewer pass approves.
- Every new mutation endpoint needs: a happy-path test, an auth-boundary test (wrong principal type rejected), and — for the claim/confirm flow specifically — a test proving a pending claim causes zero inventory/ledger/bagsRepaid changes until confirmed.

---

### Task 1: Farmer PIN + JWT scope plumbing

**Files:**
- Modify: `server/src/types/index.ts` (`IFarmer.pinHash`, `JwtPayload` union)
- Modify: `server/src/models/farmer.model.ts` (`pinHash` field, `select: false`)
- Modify: `server/src/utils/jwt.ts` (generic sign/verify over the union)
- Create: `server/src/middleware/farmer-auth.ts` (`requireFarmerAuth`)
- Modify: `server/src/middleware/auth.ts` (`requireAuth` narrows and rejects a farmer-scoped token)
- Test: `server/src/middleware/farmer-auth.test.ts`, extend `server/src/middleware/auth.test.ts` with a cross-scope rejection case

**Interfaces:**
- Produces: `requireFarmerAuth` (sets `req.farmer = { id: ObjectId }`), updated `signToken`/`verifyToken`.
- Consumes: existing `AppError`, `FarmerModel`.

- [ ] Step 1: Add `pinHash?: string` to `IFarmer`; add the `JwtPayload` union as specified above.
- [ ] Step 2: Add `pinHash: { type: String, select: false }` to the farmer schema (no `required` — farmers may have no PIN yet).
- [ ] Step 3: Update `signToken`/`verifyToken` to be generic/discriminated over the union; keep the staff call sites (`login` in `auth.service.ts`) compiling unchanged.
- [ ] Step 4: Write `requireFarmerAuth`, structurally mirroring `requireAuth` — verify → narrow to `scope === "farmer"` (401 "Not authenticated" if the token is staff-shaped) → load `FarmerModel.findById(payload.sub)` (401 if missing — farmers are undeletable so this is defense-in-depth, not a real path) → `req.farmer = { id }`.
- [ ] Step 5: Update `requireAuth` to 401 if the verified payload lacks `role` (i.e. is farmer-shaped).
- [ ] Step 6: Tests: farmer token rejected by `requireAuth`, staff token rejected by `requireFarmerAuth`, valid farmer token accepted by `requireFarmerAuth` and populates `req.farmer`.
- [ ] Step 7: `npx tsc --noEmit` + full `npx vitest run` — existing staff-auth tests must still pass unmodified.
- [ ] Step 8: Reviewer pass (auth is the highest-leverage place to get this wrong — demand a finding-free or fully-resolved review before commit).
- [ ] Step 9: Commit: `feat(server): farmer PIN storage and scoped JWT for farmer auth`

---

### Task 2: Trader sets/resets a farmer's PIN

**Files:**
- Modify: `server/src/validators/farmer.validator.ts` (PIN schema: 4-6 digits)
- Modify: `server/src/services/farmer.service.ts` (`setFarmerPin`)
- Modify: `server/src/controllers/farmer.controller.ts`, `server/src/routes/farmer.route.ts` (`POST /api/farmers/:id/pin`, staff-authed)
- Test: extend `server/src/routes/farmer.route.test.ts`
- Modify (client): `client/src/pages/FarmerDetailPage.tsx` ("Set portal PIN" action + dialog), `client/src/services/farmers.ts`

**Interfaces:**
- Produces: `POST /api/farmers/:id/pin` `{ pin }` → 204. Staff-only (existing `requireAuth`).

- [ ] Step 1: Zod schema: `pin` = 4-6 digit numeric string (`/^\d{4,6}$/`) — a farmer's PIN is not a password, don't over-engineer complexity requirements onto illiterate/low-literacy users' phone PINs.
- [ ] Step 2: `setFarmerPin(farmerId, pin)`: 404 if farmer missing, else `hashPassword(pin)` (reuse existing util) into `pinHash`, save.
- [ ] Step 3: Route + controller, staff-authed.
- [ ] Step 4: Tests: sets PIN (verify via a subsequent login in Task 3's tests, not by reading the hash), 404 on unknown farmer, 400 on non-numeric/wrong-length PIN, 401 without staff token.
- [ ] Step 5: Client: a "Set portal PIN" button on `FarmerDetailPage` opening a small dialog (PIN + confirm-PIN inputs, client-side match check, calls the new endpoint). No PIN is ever displayed back — same principle as the admin seed password (shown once, never persisted server-side in plaintext).
- [ ] Step 6: Full verification (tsc, vitest, client build/lint) + reviewer pass + commit: `feat(server,client): trader can set a farmer's portal PIN`

---

### Task 3: Farmer login

**Files:**
- Create: `server/src/services/farmer-auth.service.ts` (`loginFarmer(phone, pin)`)
- Create: `server/src/validators/farmer-auth.validator.ts`
- Create: `server/src/controllers/farmer-portal.controller.ts` (login controller only, for now)
- Create: `server/src/routes/farmer-portal.route.ts` (mount `/login` only, for now)
- Modify: `server/src/routes/index.ts`
- Test: `server/src/routes/farmer-portal.route.test.ts`

**Interfaces:**
- Produces: `POST /api/farmer-portal/login` `{ phone, pin }` → `{ success: true, data: { token } }`.
- Consumes: `ghanaPhoneSchema` (reuse — normalize the phone the same way farmer records do), `FarmerModel`, `comparePassword`.

- [ ] Step 1: `loginFarmer`: normalize phone via the shared `ghanaPhoneSchema` transform logic (extract if needed so both validators can use it without a circular import — check current export shape in `farmer.validator.ts` first), `findOne({ phone }).select("+pinHash")`. If no farmer, or farmer has no `pinHash` set yet, or PIN mismatch → **the same generic 401 message** ("Invalid phone number or PIN") — do not distinguish "no such farmer" from "wrong PIN" from "PIN not set," mirroring the timing-safe-dummy-hash pattern already in `auth.service.ts`'s `login`. Reuse or extend the `DUMMY_HASH` constant so a request for a phone with no PIN set still takes a real bcrypt compare (timing oracle prevention, same reasoning as the existing comment).
- [ ] Step 2: On success, `signToken({ sub: farmer._id.toString(), scope: "farmer" })`.
- [ ] Step 3: Route with the same shape of rate limiter as staff login (10/min) — copy the pattern, do not share the limiter instance (separate abuse surface).
- [ ] Step 4: Tests: valid login, wrong PIN, unknown phone, farmer with no PIN set yet (all 401, same message), phone-format normalization on login input, 400 on malformed body.
- [ ] Step 5: Verification + reviewer pass + commit: `feat(server): farmer portal login`

---

### Task 4: Farmer-scoped read endpoints

**Files:**
- Modify: `server/src/controllers/farmer-portal.controller.ts` (add `me`, `myAdvances`, `myRepayments`)
- Modify: `server/src/routes/farmer-portal.route.ts` (mount the three, behind `requireFarmerAuth`)
- Test: extend `server/src/routes/farmer-portal.route.test.ts`

**Interfaces:**
- Produces: `GET /me`, `GET /advances` (delegates to `advance.service.ts`'s `listAdvances` + `getFarmerAdvanceSummary`, `farmerId` forced to `req.farmer.id`, ignoring/rejecting any client-supplied `farmerId` query param), `GET /repayments` (delegates to `repayment.service.ts`'s `listRepayments`, same forcing).

- [ ] Step 1: `me` controller: `FarmerModel.findById(req.farmer.id)` (no `pinHash` — schema already excludes by default).
- [ ] Step 2: `myAdvances`: call `listAdvances({ ...parsedQuery, farmerId: req.farmer.id })` — the query schema must not accept a `farmerId` field at all here (define a portal-specific query schema without it, don't just override after parsing — closing the door at validation is the safer pattern already used elsewhere in this codebase for e.g. `updateFarmerSchema`'s empty-body refine). Also return `getFarmerAdvanceSummary(req.farmer.id)` in the same payload.
- [ ] Step 3: `myRepayments`: same forcing pattern against `listRepayments`.
- [ ] Step 4: Tests, critically including: **farmer A cannot see farmer B's data** even by trying to pass `?farmerId=<B>` (assert the response only ever contains A's records regardless of query tampering), 401 with a staff token, 401 with no token, 401 with an expired/garbage token.
- [ ] Step 5: Verification + reviewer pass + commit: `feat(server): farmer-scoped read endpoints for own advances and repayments`

---

### Task 5: Repayment claims — submission (farmer side, inert data only)

**Files:**
- Create: `server/src/models/repayment-claim.model.ts`
- Create: `server/src/validators/repayment-claim.validator.ts`
- Create: `server/src/services/repayment-claim.service.ts` (`submitClaim`, `listMyClaims`)
- Modify: `server/src/controllers/farmer-portal.controller.ts`, `server/src/routes/farmer-portal.route.ts`
- Test: `server/src/routes/farmer-portal.route.test.ts` (claims section)

**Interfaces:**
- Produces: `POST /api/farmer-portal/repayment-claims`, `GET /api/farmer-portal/repayment-claims`.

- [ ] Step 1: Model per the architecture section above. Unique index on `idempotencyKey` (same double-submit protection pattern as `FarmerRepaymentModel`). Compound index `{ farmerId: 1, createdAt: -1 }`.
- [ ] Step 2: `submitClaim(farmerId, input)`: load the advance, 404 if missing OR if `advance.farmerId !== farmerId` (a farmer must never learn "that advance ID exists but isn't yours" via a 403 — 404 both cases identically, same reasoning the rest of this codebase already applies to cross-tenant lookups). 400 if `advance.repaymentStatus === "completed"`. 400 (friendly message) if `bagsClaimed > expectedBags - bagsRepaid` — this is advisory only; the real enforcement remains `createRepayment`'s guarded update at confirmation time, so a slightly-stale claim (advance changed between submission and confirmation) fails safely at confirm, not here. Create the claim doc with `status: "pending"`. **No session, no transaction, no inventory/ledger/advance writes** — this is the whole point of the task.
- [ ] Step 3: Idempotency: catch E11000 on `idempotencyKey` the same way `repayment.service.ts` does — return the existing claim rather than erroring.
- [ ] Step 4: `listMyClaims(farmerId, query)`: paginated, newest-first.
- [ ] Step 5: Tests: submit creates a `pending` claim; **assert zero changes to `FarmerAdvanceModel.bagsRepaid`, zero `InventoryModel` changes, zero new `TransactionModel` docs** after submission (this is the single most important test in the whole milestone — write it defensively, checking exact counts before/after); 404 on someone else's advance; 400 on over-claim; 400 on completed advance; idempotent duplicate returns the same claim; list returns only the caller's claims.
- [ ] Step 6: Verification + reviewer pass (explicitly ask the reviewer to verify the "inert until confirmed" property) + commit: `feat(server): farmer repayment claim submission (no ledger/inventory effect until confirmed)`

---

### Task 6: Repayment claims — trader confirmation queue

**Files:**
- Modify: `server/src/services/repayment-claim.service.ts` (`listClaims`, `confirmClaim`, `rejectClaim`)
- Create: `server/src/controllers/repayment-claim.controller.ts`
- Create: `server/src/routes/repayment-claim.route.ts`
- Modify: `server/src/routes/index.ts`
- Test: `server/src/routes/repayment-claim.route.test.ts`

**Interfaces:**
- Produces: `GET /api/repayment-claims?status=`, `POST /api/repayment-claims/:id/confirm`, `POST /api/repayment-claims/:id/reject` — all staff-authed (`requireAuth`).

- [ ] Step 1: `listClaims(query)`: filter by status, populate farmer name/phone for the trader's queue UI (same `.populate<{...}>` typed pattern already used in `advance.service.ts`).
- [ ] Step 2: `confirmClaim(claimId, staffUserId)`: load claim, 404 if missing, 400 if not `pending` (already confirmed/rejected — idempotent-safe error, not a crash). Call the **existing, unmodified** `createRepayment({ advanceId: claim.advanceId, bagsSupplied: claim.bagsClaimed, idempotencyKey: <derive deterministically from the claim, e.g. claim.idempotencyKey itself>, notes: "" }, staffUserId)`. On success: `claim.status = "confirmed"`, `claim.resultingRepaymentId = repayment._id`, `claim.reviewedBy = staffUserId`, `claim.reviewedAt = now`, save. **On failure (e.g. `createRepayment` throws because the advance changed), let the error propagate — do not catch-and-mark-rejected; the claim must stay `pending` so the trader sees the real error and can decide.**
- [ ] Step 3: `rejectClaim(claimId, staffUserId, reason)`: 404 if missing, 400 if not pending, else `status = "rejected"`, `rejectionReason`, `reviewedBy`, `reviewedAt`.
- [ ] Step 4: Routes/controller, `requireAuth`.
- [ ] Step 5: Tests — this is where the property from Task 5 gets its confirming half: confirm a claim → assert `FarmerRepaymentModel` now has exactly one doc, `bagsRepaid` incremented, inventory incremented, ledger transaction written (i.e., confirming produces EXACTLY what a direct `createRepayment` call would); confirming an already-confirmed claim → 400, no double-effect; reject → claim rejected, zero side effects, advance/inventory/ledger unchanged; confirm on a claim whose advance is now over-capacity (simulate by repaying the advance fully via the normal path first) → claim-confirm surfaces the 409 from `createRepayment` and the claim remains `pending`; 401 without staff token; 401 with a farmer token.
- [ ] Step 6: Verification + reviewer pass (ask explicitly: "does confirm ever produce a different financial outcome than calling createRepayment directly would?") + commit: `feat(server): trader confirm/reject queue for repayment claims`

---

### Task 7: Client — farmer portal auth + shell

**Files:**
- Create: `client/src/services/farmerPortal.ts` (mirrors `services/auth.ts` + a farmer-scoped `api` instance)
- Create: `client/src/context/FarmerAuthContext.tsx`
- Create: `client/src/components/FarmerProtectedRoute.tsx`
- Create: `client/src/layouts/PortalLayout.tsx`
- Create: `client/src/pages/portal/PortalLoginPage.tsx`
- Modify: `client/src/App.tsx` (mount `/portal/*` as a second, independent route subtree — not nested under the existing `AuthProvider`/`ProtectedRoute`)

**Interfaces:**
- Produces: `useFarmerAuth()` → `{ farmer, loading, login(phone, pin), logout() }`, token under `agritrade_farmer_token` (distinct key from `agritrade_token` so a trader and a farmer can be logged in simultaneously in the same browser, e.g. a trader demoing the portal).

- [ ] Step 1: A second axios instance (or the same `api` with a per-request override — simplest: a second instance, since the interceptor's 401-redirect target differs: `/portal/login` vs `/login`) reading/writing the farmer token key.
- [ ] Step 2: `FarmerAuthContext` structurally mirrors `AuthContext` (bootstraps from `me` on mount, exposes login/logout).
- [ ] Step 3: `PortalLoginPage`: phone + PIN inputs, reuses the same form patterns as `LoginPage.tsx`.
- [ ] Step 4: `PortalLayout`: minimal header (farmer name, log out), no staff nav.
- [ ] Step 5: Wire `/portal/login` (public) and `/portal` subtree behind `FarmerProtectedRoute` in `App.tsx`, as a sibling tree to the existing staff routes (both trees can be mounted in the same `<Routes>` without conflict since paths don't overlap).
- [ ] Step 6: Client build/lint clean + reviewer pass (check for the same login-page patterns already approved: error display, submitting-state disable) + commit: `feat(client): farmer portal auth shell`

---

### Task 8: Client — farmer dashboard, claim submission, staff confirm queue

**Files:**
- Create: `client/src/pages/portal/PortalDashboardPage.tsx` (balance summary + advances list, read-only)
- Create: `client/src/pages/portal/PortalClaimsPage.tsx` (submit form + own claim history with status)
- Create: `client/src/pages/RepaymentClaimsQueuePage.tsx` (staff-side confirm/reject queue)
- Modify: `client/src/App.tsx`, `client/src/layouts/AppLayout.tsx` (nav entry for the staff queue page)
- Modify: `client/src/services/farmerPortal.ts` (claim submit/list calls)
- Create: `client/src/services/repaymentClaims.ts` (staff-side list/confirm/reject calls)

- [ ] Step 1: `PortalDashboardPage`: fetch `me` + `advances` (which already returns the summary), render outstanding balance (server-computed, `formatGHS`) and an advances table — same shadcn Table/Card primitives already in the codebase, no new UI kit.
- [ ] Step 2: `PortalClaimsPage`: form (pick an open advance from `myAdvances`, bags claimed, generate `idempotencyKey` via `crypto.randomUUID()` once per dialog-open — same pattern as `FarmerDetailPage`'s repayment dialog), plus a table of the farmer's own claims with status badges (pending/confirmed/rejected — reuse the badge styling already established for `repaymentStatus`/`paymentStatus`).
- [ ] Step 3: `RepaymentClaimsQueuePage` (staff side): pending-claims table (farmer name, advance, bags claimed, submitted date) with Confirm/Reject actions per row; confirm shows the same kind of "reload and try again" error surface as the rest of the app if `createRepayment` rejects it underneath; reject opens a small reason dialog.
- [ ] Step 4: Nav entry for the staff queue (badge with pending count, optional nice-to-have — check `getFarmerAdvanceSummary`-style server aggregation exists before adding a count, don't compute it client-side over a paginated slice).
- [ ] Step 5: Client build/lint clean.
- [ ] Step 6: Manual smoke test (per `superpowers:verification-before-completion` — this phase has a real UI, don't just trust the build): log in as a farmer, submit a claim; log in as staff, confirm it, verify the farmer's balance/repayment history updates; submit + reject another claim, verify no side effects.
- [ ] Step 7: Reviewer pass on the full client surface + commit: `feat(client): farmer portal dashboard/claims and staff confirmation queue`

---

### Task 9: End-to-end verification + docs

**Files:**
- Modify: `README.md` (farmer portal section: what it is, how to set a farmer's PIN, portal URL)

- [ ] Step 1: Full server suite (`npx vitest run`) — all prior milestones' tests must still be green (this plan touches shared files: `jwt.ts`, `auth.ts`, `farmer.model.ts`, `routes/index.ts` — regressions here are the highest-risk failure mode).
- [ ] Step 2: `npx tsc --noEmit` clean on server; client `npm run build` + `npm run lint` clean.
- [ ] Step 3: Manual end-to-end per the Task 10 pattern from the base plan: trader sets a farmer's PIN → farmer logs in at `/portal/login` → views balance → submits a claim → trader sees it in the queue → confirms → farmer's portal reflects the new repayment and reduced balance on next load.
- [ ] Step 4: README update.
- [ ] Step 5: Final reviewer pass across the whole milestone's diff (not just the last task) + commit: `docs: farmer portal usage`
