# SKB Project Rules

Durable, repo-wide operating rules for any agent working in this repository.

**Project context**: SKB = Shri Krishna Bhavan, a South Indian restaurant in Bellevue, WA. This codebase exists to solve the restaurant's operations pain: long waiting lines, customers being rejected after long waits, and general front-of-house throughput. Every feature should be evaluated against: "does this reduce wait time, reduce rejections, or improve the customer's experience while waiting?"

## Branching & Git
1. **Primary branch is `master`**. Branch from `master`, PR back to `master`. Never use `main`.
2. **Small PRs tied to GitHub issues.** One issue → one PR. Include acceptance criteria in the issue body and link it from the PR.

## Stack & Code
3. **TypeScript strict mode everywhere.** No `any` unless justified with an inline comment explaining why.
4. **MongoDB is the system of record.** Do not introduce a secondary database (Postgres, Redis-as-primary-store, etc.) without explicit discussion.
5. **Mobile-first UI.** Every customer-facing screen must be usable on a phone in portrait orientation. Hosts and customers will primarily interact via phone.

## Safety
6. **Never commit secrets.** Use `.env.local` for local dev; document every required env var in `README.md`. Check `.gitignore` covers `.env*` before committing.

## Testing
7. **The critical waitlist path must stay green.** Any PR touching waitlist join, wait-time estimation, customer notification, or seating/no-show handling must include or update tests covering that flow before merge.
