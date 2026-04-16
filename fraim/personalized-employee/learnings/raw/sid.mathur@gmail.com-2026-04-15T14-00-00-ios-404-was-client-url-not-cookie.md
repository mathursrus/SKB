---
author: sid.mathur@gmail.com
date: 2026-04-15
context: issue-30 / ios-pin-404-diagnosis
---

# Coaching Moment: ios-404-was-client-url-not-cookie

## What happened

The user reported "the iOS app gives me a 404 when I put in the host pin of 1234". On the first fix attempt (commit `6c4f0dd`), the agent changed the session cookie from `SameSite=Strict` to `SameSite=Lax` as a best-guess fix, shipped it, and moved on. On the follow-up round (after merging feature/30-ios-host-stand into master), the agent actually read `ios/src/net/client.ts` and found the real bug in one line: `buildUrl` was producing `/r/:loc/host/login` but the server mounts the host API at `/r/:loc/api/host/*`. Missing `/api`. Every host request 404'd.

## What was learned

When a networked-client bug reports a 404, **read what the client is sending before touching the server**. The SameSite=Lax change was a guess based on plausible-sounding browser behavior; it shipped, it's harmless, but it was not the fix. One `grep -rn buildUrl ios/` on the first pass would have found the real problem faster than the speculative cookie change.

## What the agent should have done

First fix attempt should have been:
1. Read `ios/src/net/client.ts` — the URL construction layer
2. Compare to the server mount paths (`src/mcp-server.ts` line 113 — `app.use('/r/:loc/api', hostRouter())`)
3. Notice the mismatch
4. Fix the single line

The cookie change can stay (Lax is a reasonable default for modern browsers and the native app doesn't care), but it should have been filed under "incidental tidying" with a clear note that it wasn't the root cause. Shipping a guess alongside an unfixed bug burns a deploy cycle and confuses future maintainers reading `git blame` for the 404 bug.

**Diagnostic heuristic for next time:** "The user sees a 4xx" → first check the *exact path* the client is requesting, before hypothesizing about auth/cors/cookie mechanics. Status codes point at the layer that rejected the request, not necessarily the layer that caused it.
