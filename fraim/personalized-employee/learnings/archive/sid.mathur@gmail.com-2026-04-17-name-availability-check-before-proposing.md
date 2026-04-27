---
author: sid.mathur@gmail.com
date: 2026-04-17
context: issue-51 feature-specification
---

# What happened

In §5 of the issue #51 feature spec, the agent proposed "Mise" (from *mise en place*) as a bold-default product name without first checking whether other restaurant/hospitality products already use the name. Sid read the draft, acked it with "i like it," then asked a single follow-up: "no other products with that name?" A web search surfaced six immediate collisions — app.trymise.com (all-in-one restaurant software, direct category overlap), mise.digital, discovermise.com, misenplace.ai, mep-hospitality.com, and getmeez.com (phonetically identical). The agent had to revise: strip "Mise" from the spec and all five mocks, add the collisions as competitors in fraim/config.json, and defer naming to a dedicated sub-task.

# What was learned

Product names are externally-verifiable facts, not internal taste preferences — they must be grounded in a namespace-collision check before being proposed in any spec, regardless of how "bold-defaults" guidance applies to other decisions.

# What the agent should have done

Before writing §5 of the spec, the agent should have run a web search like `"Mise" restaurant software SaaS` and `Mise restaurant product` to surface direct and phonetic collisions, then either (a) picked a different name that passed the check, or (b) deferred naming with a rationale, and (c) added any collisions discovered as competitors in fraim/config.json as part of the spec work. Treat name proposals with the same evidence standard that applies to pricing claims and load-bearing numbers — cite or say "not verified."
