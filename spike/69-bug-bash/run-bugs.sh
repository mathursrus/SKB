#!/usr/bin/env bash
# Bug-bash battery for POST /api/sms/inbound (#69 walking skeleton).
# Assumes server is listening on :15480 with SKB_ALLOW_UNSIGNED_TWILIO=1
# and that spike/69-bug-bash/bug-bash-seed.ts has been run against
# MONGODB_DB_NAME=skb_bug_bash_69.

set -u
BASE="http://localhost:15480/api/sms/inbound"
TMP=$(mktemp)

banner() { printf '\n\e[1m== %s ==\e[0m\n' "$*"; }
probe() {
    local desc="$1"; shift
    printf '\n-- %s\n' "$desc"
    printf '   curl args: %s\n' "$*"
    code=$(curl -sS -o "$TMP" -w "%{http_code}" -X POST "$BASE" "$@")
    printf '   → HTTP %s\n   body: %s\n' "$code" "$(cat "$TMP" | head -c 200)"
}

banner 'Happy path — Alice replies, single active entry at skb'
probe 'Alice — normal reply' \
    --data "From=%2B12065551111&Body=running+5+late&MessageSid=SM11111111"

banner 'Collision — Bob is active at skb AND pizza today'
probe 'Bob — expect collision logged, empty TwiML, no reply' \
    --data "From=%2B12065552222&Body=thanks&MessageSid=SM22222222"

banner 'Cold inbound — phone that is not in any queue'
probe 'Unknown phone — expect unmatched log, empty TwiML' \
    --data "From=%2B12069990000&Body=hi&MessageSid=SM33333333"

banner 'Non-active state — Dave departed earlier'
probe 'Dave (departed) — expect unmatched (state filter excludes departed)' \
    --data "From=%2B12065554444&Body=hello&MessageSid=SM44444444"

banner 'STOP handling'
probe 'Alice replies STOP — expect opt-out recorded, empty TwiML' \
    --data "From=%2B12065551111&Body=STOP&MessageSid=SM55555555"
probe 'Alice replies again after STOP — should NOT match (STOP handled before resolver anyway but post-opt-out reply still logs)' \
    --data "From=%2B12065551111&Body=hello+again&MessageSid=SM55555556"

banner 'START handling'
probe 'Alice replies START — expect opt-out cleared' \
    --data "From=%2B12065551111&Body=start&MessageSid=SM66666666"

banner 'HELP handling'
probe 'Anyone replies HELP — expect HELP TwiML auto-reply' \
    --data "From=%2B12065551111&Body=HELP&MessageSid=SM77777777"

banner 'Variants & garbage'
probe 'Mixed-case "Stop Sending" — STOP first-token should match' \
    --data "From=%2B12069991234&Body=Stop+sending+these&MessageSid=SM88888888"
probe 'Leading whitespace "   stop"' \
    --data "From=%2B12069991234&Body=+++stop&MessageSid=SM99999991"
probe 'Not STOP — "stop by later"' \
    --data "From=%2B12069991234&Body=stop+by+later&MessageSid=SM99999992"

banner 'Missing required fields'
probe 'Missing From' \
    --data "Body=hello&MessageSid=SM99999993"
probe 'Missing Body' \
    --data "From=%2B12065551111&MessageSid=SM99999994"
probe 'Empty From (present but blank)' \
    --data "From=&Body=hi&MessageSid=SM99999995"

banner 'Non-E.164 From'
probe '10-digit From no country code' \
    --data "From=2065551111&Body=test&MessageSid=SM99999996"
probe 'Junk From' \
    --data "From=not-a-phone&Body=test&MessageSid=SM99999997"

banner 'Tenant-scoped legacy route (regression check)'
probe 'Legacy /r/skb/api/sms/inbound still works for SKB' \
    --url "http://localhost:15480/r/skb/api/sms/inbound" \
    --data "From=%2B12065551111&Body=legacy+reply&MessageSid=SMLEGACY01"

banner 'Method / content-type checks'
probe 'GET on /api/sms/inbound (should be 404 per express)' -X GET -o "$TMP"
printf '\nDone.\n'
