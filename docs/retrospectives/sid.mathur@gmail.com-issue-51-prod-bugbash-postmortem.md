---
author: sid.mathur@gmail.com
date: 2026-04-19
topic: issue-51-prod-bugbash
synthesized: 2026-04-27
---

# Retrospective — Issue #51 production bug bash + UI polish

## Context

After PR #67 merged to master and Azure auto-deployed at `cf92f67`, I ran two /fraim jobs against https://skb-waitlist.azurewebsites.net back-to-back: `ui-polish-validation` then `user-testing-and-bug-bash`. Both produced evidence docs + screenshots + a follow-up PR (#68) that staged the reports onto master as a docs-only change.

## What went well

- **Azure redeploy was invisible** — master merge → app was live within the minute. No `.deployment` config to edit, no manual slot swap. That's ideal dev feedback loop.
- **Catching the menu-template gap early.** The Menu Builder lands a lot of value on the admin side, but the public `/menu` page still renders the saffron/slate template's "Menu coming soon" placeholder. Caught this by round-tripping an actual save → viewing the guest-facing URL, not by reading code. The bug bash skill "think like a user, not a developer" paid off here.
- **Validation surfaces are solid.** Signup, menu, voice-config all return specific per-field errors; nothing gave a vague 500 or silent failure. The `requireRole` cross-tenant fall-through landed via PR #67 is doing what it's supposed to (no false wrong-tenant 403 on shared tablets).
- **Tenant-derived prefixes working.** Queue code `OSHP-5B6` on the `osh-polish-probe` tenant confirms the multi-tenant plumbing carried through to the guest-visible surface.

## What went poorly

- **I misread "~8 min" as "-8 min"** in a quick screenshot scan and nearly filed a false bug. Would have been caught by the defect-documentation step, but better not to draft phantom bugs. Lesson: zoom in before calling anomalies.
- **I assumed the PR merge would make demo@osh.test available on production** when drafting the UI-polish contract, then had to pivot and sign up a fresh `polish-probe-*` user. Production MongoDB is a different DB from the local dev instance — I should have surfaced that earlier in the Phase 1 contract.
- **The Google Business Profile deploy-config gap** (P0-A) should have been anticipated and surfaced during the pre-merge checklist, not discovered during the prod UI-polish run. PRs that introduce new env-var requirements should include a "deploy checklist" section that runs the reviewer through setting them up.

## Root cause analysis

### P1-A: public `/menu` ignores structured menu

- When the menu-URL quick-field was replaced by the structured Menu Builder, the admin side and persistence got updated but the diner-facing render path didn't. Two-sided features require both ends of the contract to move in lockstep.
- Test gap: the new menu-builder UI test asserts the API round-trip (menu save → `GET /api/menu`) but not the template-render round-trip (menu save → visit `/r/:loc/menu` → assert item names in HTML).
- Contributing factor: the "does the guest see it?" question wasn't the final bullet on the Menu Builder story's acceptance criteria.

## Key learnings

1. **Two-sided features need a "both-sides" acceptance test**: every admin-side change that produces data consumed by a public page should include an integration test that loads the public page and asserts the data appears.
2. **Deploy-config gaps are a real defect class**: when code adds new env-var dependencies (`OSH_GOOGLE_*`, `SKB_PUBLIC_BASE_URL`), the PR description should include the exact portal steps to set them, ideally with a checklist the reviewer ticks before merging.
3. **/fraim jobs pair well back-to-back**: UI polish finds "does it look right"; bug bash finds "does it do the right thing". Running one after the other on the same deployed build with the same persona catches both classes in one session.

## Prevention measures

- [ ] **Add** `tests/integration/menu-public-render.integration.test.ts` — signup → save menu via API → `GET /r/:loc/menu` → parse HTML → assert first item name appears escaped.
- [ ] **Document** the env-var checklist inline on each feature PR that introduces one. Borrow the format used in PR #67's "Deploy notes" section but make it a standing template section.
- [ ] **Wire** saffron/slate `menu.html` templates to iterate over `{{#each menu.sections}}` / `{{#each items}}` with HTML-escaped outputs.
- [ ] **Add** a smoke `/fraim pr-iteration` run against production after any master-to-prod deploy so new env-var gaps surface in the CI lane, not by me spotting them during a bug bash.

## Feedback analysis

No reviewer feedback on PR #68 yet (opened this session). If patterns emerge in async review, they'll go into the next retro.

## Process effectiveness

The `ui-polish-validation` + `user-testing-and-bug-bash` jobs were well-suited for a post-deploy pass. Both had explicit phases that prevented skipping straight to "report looks fine" — the phase discipline forced me to actually click the file picker, save a menu, view the public page, and spot P1-A. Without the phase structure I'd have merged and called it done.

One refinement: the `prepare-test-environment` phase's prescribed "active listening" step doesn't add value when the user's invocation already names the persona + journeys (Sid's skill arg did). A cheap tweak to the job would be "skip active listening if the invocation includes explicit scope."
