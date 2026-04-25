---
author: sid.mathur@gmail.com
date: 2026-04-25
context: issue-83 / technical-design
---

# Coaching Moment: validate-twilio-payloads-first

## What happened

I completed the caller-statistics spike and RFC based on a validated Mongo persistence model, but I did not validate the Twilio webhook payload contract with the same rigor before presenting the design as review-ready. The user correctly pointed out that the most important question was whether Twilio actually provides the raw fields needed for the analytics model, especially for abandonment and stage transitions.

## What was learned

When a design depends on third-party webhook payloads, validate the exact provider payload contract before declaring the design ready for review.

## What the agent should have done

I should have checked Twilio's official Voice and Gather webhook documentation during the spike/design phase, mapped those documented fields to the exact `voice.ts` handlers, and then written the RFC to distinguish provider-supplied raw fields from analytics outcomes inferred by our application.
