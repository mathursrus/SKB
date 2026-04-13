---
author: sid.mathur@gmail.com
date: 2026-04-10
context: conversational-session (FRAIM business-plan-creation job)
---

# Coaching Moment: fabricated-cogs-volume

## What happened

During Phase 6 (additional-business-considerations) of the FRAIM business-plan-creation job for productizing SKB into "Frontline", the agent wrote a cost-of-goods-sold table in `docs/business-development/business-plan.md` claiming ~$10.34/month per Pro customer and 87% gross margin, based on an assumption of "~600 SMS/month" per restaurant. This number was not grounded in SKB Bellevue's actual production telemetry, nor sanity-checked against realistic restaurant volumes. The agent committed the business plan to master (commit 779616f) with this error intact. The user then asked a follow-up question: "tell me what is my actual twilio cost for a restaurant? unit economics" — which immediately exposed that a realistic 80-joins/day restaurant sends ~6,500 SMS/month, not 600, making the true COGS on pure Twilio ~$92/month and the gross margin at SKB Bellevue scale roughly -23%, not +87%. The business plan's load-bearing unit-economics claim was wrong by an order of magnitude in a direction that would have sunk the business if any pricing decision had been locked in on top of it.

## What was learned

Load-bearing numbers in strategy documents — especially COGS, ARPU, churn, and margin — must be grounded in real telemetry from a production source, or explicitly flagged as "this is an estimate pending measurement." Never write a precise-looking figure (e.g., 600 SMS/mo) without either showing the derivation OR labeling it as a placeholder that blocks downstream decisions.

## What the agent should have done

Before writing the COGS table, the agent should have either (a) queried `src/services/analytics.ts` or the deployed SKB instance for actual 30-day join counts and derived SMS volume from that, or (b) explicitly marked the numbers as placeholder estimates with a "requires telemetry validation" note and added a Phase-7 action item to pull real data before any pricing decision was locked. This is the same failure mode as the existing `sid.mathur@gmail.com-2026-04-10T01-41-35-no-evidence-no-fix.md` coaching moment — making load-bearing changes without evidence. The fact that two no-evidence errors landed in the same day suggests a systemic issue, not a one-off lapse.
