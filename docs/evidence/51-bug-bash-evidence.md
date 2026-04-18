# Issue #51 Bug-Bash Evidence

**Date:** 2026-04-17
**Branch under test:** `feature/51-fully-multi-tenant-system`
**Fix branch:** `feature/51-bug-bash-fixes`
**Scope:** End-to-end user testing of the 6 merged sub-issues (#52 auth, #53 users, #54 signup, #55 invites, #56 templates, #57 marketing) against a running dev server.

---

## Scenario-by-scenario verdict

| # | Scenario | Verdict | Notes |
|---|---|---|---|
| 1 | Fresh owner signup happy path | PASS | `POST /api/signup` → 201, `skb_session` cookie minted, login with same creds succeeds, `/r/alices-cafe/admin.html` reachable. |
| 2 | Onboarding wizard progression | PASS | 4 steps persist to `Location.onboardingSteps`, GET returns `done: true` after all four POSTed. |
| 3 | Website template switch (slate ⇄ saffron) | **FAIL → FIXED** | Bug: non-SKB tenant using saffron fell back to `public/home.html` (hardcoded SKB content, no placeholders). See bug #1 below. |
| 4 | Staff invite → accept → role gating | PASS | Host accepts invite → can reach host APIs but 403 on `/api/staff` and admin config endpoints. |
| 5 | Cross-tenant probe (10 endpoints) | PASS | Owner-A cookie → 403 on every protected endpoint at `/r/b/...`. |
| 6 | Legacy PIN tablet (`skb` PIN=1234) | PASS | Cookie minted in new `<lid>.<exp>.<mac>` format with `lid=skb`; rejected (403) at other locations. |
| 7 | SKB Bellevue backward-compat (`Host: skbbellevue.com`) | PASS | `/` → SKB home, `/queue.html` → SKB queue, `/api/host/login` with PIN → 200 with cookie. (Test initially false-positive on `fetch()` because undici overrides the Host header — switched to raw `http.request` to actually exercise the rewrite.) |
| 8 | Marketing landing gating | PASS | Naked domain (`Host: notamatch.example`) → landing.html with "Start free"; `Host: skbbellevue.com` → SKB home (not landing). |
| 9 | Password reset | PASS | `POST /api/password-reset/request` → token emitted in server log; `POST /api/password-reset/confirm` → 200; login with new password works; old password no longer works. |
| 10 | Onboarding cross-tenant probe | PASS | Owner-A → `POST /r/b/api/onboarding/steps` returns 403 with `auth.wrong-tenant` log. |

**Total after fix:** 10 / 10 passed.

---

## Bugs found

### Bug 1 — New tenants inherit SKB's hardcoded home page

**Scenario:** 3 (template switch)
**Severity:** High — every new tenant signing up under the default `saffron` template sees Shri Krishna Bhavan's home page with "Authentic South Indian Cuisine" hero, South Indian dish cards, and SKB address/hours. Violates spec §6.7 ("each restaurant's diner page is rendered from the template they picked … instead of everyone inheriting the Shri Krishna Bhavan site") and G3.

**Root cause:** `src/services/site-renderer.ts`'s `resolveTemplateFile` fell back to `public/home.html` (the hand-written SKB site) whenever the active template was `saffron` and the `templates/saffron/` directory didn't exist on disk. That fallback was intended for SKB Bellevue (G5 zero-change) but was applied unconditionally. `public/home.html` has zero `{{placeholder}}` tokens, so even the content that was in the DB (e.g. `content.heroHeadline = "Hello from slate"`) was dropped on render.

**Fix (commit SHA TBD after commit):** Make the legacy-file fallback SKB-only. For any tenant with `_id !== 'skb'` using `saffron`, cascade through `templates/saffron/` (absent today) then `templates/slate/`. Slate has full placeholder support, so the tenant's content renders correctly until a proper saffron template dir is authored.

**Files:**
- `src/services/site-renderer.ts` — `resolveTemplateFile` now takes `location._id` into account and only falls back to legacy `public/<file>.html` for `_id === 'skb'`.
- `tests/unit/siteRenderer.test.ts` — three new cases under the `bug-bash-51` tag cover the invariant (SKB falls back to legacy; non-SKB does NOT get legacy; non-SKB+slate resolves the slate dir).

**Tests after fix:** full unit suite green (292 tests, 0 fail); site-renderer + multi-tenancy + marketing-landing + signup + invites + auth integration suites all green.

**Follow-up (not blocking):** Author an actual `public/templates/saffron/{home,menu,about,hours-location,contact}.html` set so saffron-picking tenants get the warm palette the spec promised (§7) rather than falling through to slate. Tracked as a follow-up since the v1 spec only requires two templates for "proving the pattern"; the interim slate fallback is visually different but functionally correct.

---

## Bugs found but left unfixed

None. The only product bug found was fixed.

Two **test-harness issues** were found and corrected in the bug-bash runner (not product bugs):

1. `fetch()` in node ignores `Host` header overrides (undici sets Host from the URL). The runner now uses raw `http.request` for scenarios that depend on Host-based routing. Without this, scenarios 7–8 false-positived or false-negatived depending on which page's title happened to contain the match string.
2. Invite tokens and password-reset tokens are stored **hashed** in MongoDB (SHA-256 in `invites.tokenHash` / `password_resets.tokenHash`). Early versions of the runner queried for a raw `token` field and failed; the runner now parses the server log for the emitted token, matching how dev + prod both surface the token (log line in dev, mailer in prod).

---

## Notes on dev-server setup for reproduction

- **Mongo:** local `mongod` Windows service (default URI `mongodb://localhost:27017`). Database `skb_bugbash_51` used for an isolated run; dropped at the start of each bug-bash via `node bug-bash-reset.mjs`.
- **Branch detection gotcha:** `src/core/utils/git-utils.ts` derives `determineDatabaseName()` from the branch name before consulting `MONGODB_DB_NAME`, so the bug-bash run sets `FRAIM_BRANCH=bugbash` (no digit → no auto-derived name) alongside `MONGODB_DB_NAME=skb_bugbash_51`.
- **Server restart required after DB drop:** `ensureLocation('skb', ...)` only runs at bootstrap. If the DB is dropped while the server is running, the `skb` row disappears and `publicHost` rewrites stop matching; scenario 7 upserts the row defensively but the running server must be restarted before a fresh run.

Artifacts left in repo root for local re-runs (not committed):
- `bug-bash-run.mjs` — the scenario runner
- `bug-bash-reset.mjs` — drops the bug-bash DB between runs
- `bug-bash-check.mjs` — ad-hoc DB inspector (overwritten during investigation)
- `.bug-bash-env.cjs` — env var bundle

---

## Final summary

- 10 of 10 user-journey scenarios pass against `feature/51-bug-bash-fixes`.
- 1 bug found, fixed in-place with a unit test.
- 0 bugs left unfixed.
- Existing unit + integration test suites unaffected.
