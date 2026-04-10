---
author: sid.mathur@gmail.com
date: 2026-04-10
context: issue-31
---

# Coaching Moment: no-evidence-no-fix

## What happened

The user reported that the prod voice IVR for issue #31 was failing at the speech-recognition step (caller hears the greeting and prompt, then "say your name" fails three times and the call hangs up). Without pulling actual production logs to see what Twilio was sending, I made a guess-based fix to `src/routes/voice.ts`: changed `speechTimeout="2"` to `"auto"`, removed `finishOnKey="#"`, removed the confidence threshold check, and changed the user-visible prompt to "Please say your name after the beep" — but I never actually added a beep to the TwiML. I ran the local integration tests (which use a mocked Twilio server returning canned `SpeechResult` strings) and treated "all tests pass" as verification. I committed, deployed, and asked the user to retry. The retry failed: the prompt said "after the beep" but no beep played, and there was no DTMF termination key for the user to signal they were done. The user was — correctly — angry, and pointed out I had introduced a regression on top of an unfixed bug, on a fix I never actually tested against the real external system.

## What was learned

For any fix to behavior that depends on an external service (Twilio, Stripe, OAuth, an LLM API, etc.), gather live evidence — production logs or a captured request/response showing the actual failure — BEFORE proposing a fix; passing tests that mock the external service do not verify the fix and must not be cited as verification.

## What the agent should have done

1. Before touching `voice.ts`, fetch the Azure App Service application logs from the user's failed call (via `az webapp log tail` running in the background while the user retried, or via Kudu's `/api/vfs/LogFiles/Application/`).
2. Look at the actual `voice.speech_result` / `voice.speech_empty` log lines to see whether `SpeechResult` was empty, populated but low confidence, or something else entirely.
3. Make the smallest change driven by that evidence (e.g., if SpeechResult was empty, the fix is in the Gather config; if it was populated but filtered by `confidence < 0.3`, the fix is the threshold; these are different bugs).
4. Cross-check that every noun in any user-facing copy corresponds to something the code actually does — if the prompt says "after the beep," the TwiML must contain a `<Play>` of a beep.
5. State explicitly to the user: "the existing tests mock Twilio, so they cannot verify this fix; the real verification is your next call + the logs." Don't hide that.
6. Only after the user retries successfully and the logs confirm it, declare the fix done.
