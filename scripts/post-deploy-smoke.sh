#!/usr/bin/env bash
# ============================================================================
# SKB - Post-deploy authenticated smoke (project rule #8)
# ============================================================================
#
# Runs after Azure deploys a fresh build, BEFORE the workflow marks success.
# Logs in as the persistent test owner, exercises the user-facing routes that
# have a history of breaking (issue #93 was /staff), and cleans up after
# itself using the same routes a real host would use.
#
# A deploy is not "successful" until this script exits 0. This is the
# structural fix for the recurring "user as tester" pattern documented in
# docs/retrospectives/sid.mathur@gmail.com-issue-93-staff-503-postmortem.md.
#
# Design choice (per code review): no special admin/cleanup endpoints. The
# smoke uses only routes that real owners hit during normal operation — login,
# /staff, /queue/state, /host/queue/add, /host/queue, /host/queue/:code/remove.
# Cleanup of the test party is via the same `remove` route a host clicks when
# a party leaves.
#
# Required env:
#   SMOKE_BASE_URL          base URL of the deployed environment
#                           (e.g. https://skb-waitlist.azurewebsites.net)
#   SMOKE_OWNER_EMAIL       login email for the persistent test tenant
#                           (the IANA-reserved @example.test domain is used
#                           so this credential never collides with real users)
#   SMOKE_OWNER_PASSWORD    login password (GitHub repo secret)
#   SMOKE_TENANT_SLUG       tenant slug owned by SMOKE_OWNER_EMAIL
#                           (one-time setup creates this via /api/signup)
#
# Exit codes:
#   0 — all probes succeeded, test party removed
#   1 — login failed (credentials wrong, tenant missing, or auth broken)
#   2 — /staff failed (regression of the issue #93 class)
#   3 — /queue/state failed (waitlist read path broken)
#   4 — add party failed (waitlist write path broken)
#   5 — list queue failed or the added party isn't there
#   6 — remove party failed (test party stays in the test tenant queue —
#       not a customer impact, but accumulates state across runs)
# ============================================================================

set -u  # not -e so we can capture failures and report them all

: "${SMOKE_BASE_URL:?SMOKE_BASE_URL must be set}"
: "${SMOKE_OWNER_EMAIL:?SMOKE_OWNER_EMAIL must be set}"
: "${SMOKE_OWNER_PASSWORD:?SMOKE_OWNER_PASSWORD must be set}"
: "${SMOKE_TENANT_SLUG:?SMOKE_TENANT_SLUG must be set}"

SHA_SHORT="${GITHUB_SHA:-localdev}"
SHA_SHORT="${SHA_SHORT:0:8}"
PARTY_NAME="Smoke ${SHA_SHORT}"
# Phone needs to be exactly 10 digits, valid-shaped. Use 555 prefix + a
# 7-digit suffix derived from $RANDOM (avoids bash arithmetic edge cases
# when SHA_SHORT happens to be all-letter or starts with 0).
PHONE="555$(printf '%07d' $(( RANDOM % 10000000 )))"
COOKIE_JAR="$(mktemp)"

cleanup_jar() { rm -f "$COOKIE_JAR"; }
trap cleanup_jar EXIT

echo "[smoke] base=${SMOKE_BASE_URL} tenant=${SMOKE_TENANT_SLUG} party='${PARTY_NAME}'"

curl_with_code() {
    # $1 = method, $2 = url, $3 = optional body, $4 = optional auth
    # Echoes "BODY\n__HTTP__=NNN" for caller to parse.
    local method="$1" url="$2" body="${3:-}" auth="${4:-}"
    local args=( -sS -X "$method" -w "\n__HTTP__=%{http_code}" )
    if [ "$auth" = "with-cookie" ]; then args+=( -b "$COOKIE_JAR" ); fi
    if [ "$auth" = "save-cookie" ]; then args+=( -c "$COOKIE_JAR" ); fi
    if [ -n "$body" ]; then
        args+=( -H "Content-Type: application/json" -d "$body" )
    fi
    curl "${args[@]}" "$url"
}
extract_code() { echo "$1" | grep "^__HTTP__=" | cut -d= -f2; }
extract_body() { echo "$1" | grep -v "^__HTTP__="; }

# ─── Probe 1: login ─────────────────────────────────────────────────────
LOGIN_BODY="{\"email\":\"${SMOKE_OWNER_EMAIL}\",\"password\":\"${SMOKE_OWNER_PASSWORD}\"}"
LOGIN_RESP=$(curl_with_code POST "${SMOKE_BASE_URL}/api/login" "$LOGIN_BODY" save-cookie)
LOGIN_CODE=$(extract_code "$LOGIN_RESP")
if [ "$LOGIN_CODE" != "200" ]; then
    echo "[smoke] FAIL login: HTTP ${LOGIN_CODE}"
    echo "[smoke] body: $(extract_body "$LOGIN_RESP")"
    exit 1
fi
echo "[smoke] ok login -> 200"

# ─── Probe 2: GET /staff (the issue #93 regression surface) ────────────
STAFF_RESP=$(curl_with_code GET "${SMOKE_BASE_URL}/r/${SMOKE_TENANT_SLUG}/api/staff" "" with-cookie)
STAFF_CODE=$(extract_code "$STAFF_RESP")
STAFF_BODY=$(extract_body "$STAFF_RESP")
if [ "$STAFF_CODE" != "200" ]; then
    echo "[smoke] FAIL /staff: HTTP ${STAFF_CODE}"
    echo "[smoke] body: ${STAFF_BODY}"
    EXIT_REASON=2
elif ! echo "$STAFF_BODY" | grep -q "\"$SMOKE_OWNER_EMAIL\""; then
    echo "[smoke] FAIL /staff: response missing owner row for ${SMOKE_OWNER_EMAIL}"
    echo "[smoke] body: ${STAFF_BODY}"
    EXIT_REASON=2
else
    echo "[smoke] ok /staff -> 200 with owner row"
fi

# ─── Probe 3: GET /queue/state (waitlist read path) ─────────────────────
QUEUE_STATE_RESP=$(curl_with_code GET "${SMOKE_BASE_URL}/r/${SMOKE_TENANT_SLUG}/api/queue/state" "" with-cookie)
QUEUE_STATE_CODE=$(extract_code "$QUEUE_STATE_RESP")
if [ "$QUEUE_STATE_CODE" != "200" ]; then
    echo "[smoke] FAIL /queue/state: HTTP ${QUEUE_STATE_CODE}"
    echo "[smoke] body: $(extract_body "$QUEUE_STATE_RESP")"
    EXIT_REASON="${EXIT_REASON:-3}"
else
    echo "[smoke] ok /queue/state -> 200"
fi

# ─── Probe 4: POST /host/queue/add (waitlist write path) ────────────────
ADD_BODY="{\"name\":\"${PARTY_NAME}\",\"partySize\":2,\"phone\":\"${PHONE}\"}"
ADD_RESP=$(curl_with_code POST "${SMOKE_BASE_URL}/r/${SMOKE_TENANT_SLUG}/api/host/queue/add" "$ADD_BODY" with-cookie)
ADD_CODE=$(extract_code "$ADD_RESP")
ADD_BODY_ONLY=$(extract_body "$ADD_RESP")
PARTY_CODE=""
if [ "$ADD_CODE" != "200" ]; then
    echo "[smoke] FAIL add party: HTTP ${ADD_CODE}"
    echo "[smoke] body: ${ADD_BODY_ONLY}"
    EXIT_REASON="${EXIT_REASON:-4}"
else
    PARTY_CODE=$(echo "$ADD_BODY_ONLY" | grep -o '"code":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "[smoke] ok add party -> 200 code=${PARTY_CODE}"
fi

# ─── Probe 5: GET /host/queue (assert our party is in the list, capture id) ─
PARTY_ID=""
if [ -n "$PARTY_CODE" ]; then
    LIST_RESP=$(curl_with_code GET "${SMOKE_BASE_URL}/r/${SMOKE_TENANT_SLUG}/api/host/queue" "" with-cookie)
    LIST_CODE=$(extract_code "$LIST_RESP")
    LIST_BODY=$(extract_body "$LIST_RESP")
    if [ "$LIST_CODE" != "200" ]; then
        echo "[smoke] FAIL /host/queue list: HTTP ${LIST_CODE}"
        EXIT_REASON="${EXIT_REASON:-5}"
    elif ! echo "$LIST_BODY" | grep -q "\"$PARTY_CODE\""; then
        echo "[smoke] FAIL /host/queue list: added party ${PARTY_CODE} not in response"
        echo "[smoke] body: ${LIST_BODY}"
        EXIT_REASON="${EXIT_REASON:-5}"
    else
        # Pull the party's Mongo id (needed by /host/queue/:id/remove). Each
        # party object has both `id` (ObjectId hex) and `code` (e.g. SMOK-FW5).
        # Match the object containing our code, then extract its id.
        PARTY_ID=$(echo "$LIST_BODY" | python -c "
import json, sys
data = json.load(sys.stdin)
for p in data.get('parties', []):
    if p.get('code') == '${PARTY_CODE}':
        print(p.get('id', ''))
        break
" 2>/dev/null)
        echo "[smoke] ok /host/queue list -> 200 with party ${PARTY_CODE} (id=${PARTY_ID})"
    fi
fi

# ─── Cleanup: remove the test party via the SAME route a host uses ─────
# Always attempt cleanup, even if probes failed, so we don't leave stale
# parties in the test tenant's queue. The :id in this URL is the Mongo
# ObjectId, not the queue code — captured above from the queue list.
if [ -n "$PARTY_ID" ]; then
    REMOVE_BODY='{"reason":"no_show"}'
    REMOVE_RESP=$(curl_with_code POST "${SMOKE_BASE_URL}/r/${SMOKE_TENANT_SLUG}/api/host/queue/${PARTY_ID}/remove" "$REMOVE_BODY" with-cookie)
    REMOVE_CODE=$(extract_code "$REMOVE_RESP")
    if [ "$REMOVE_CODE" != "200" ]; then
        echo "[smoke] WARN remove party ${PARTY_CODE}: HTTP ${REMOVE_CODE}"
        echo "[smoke] body: $(extract_body "$REMOVE_RESP")"
        EXIT_REASON="${EXIT_REASON:-6}"
    else
        echo "[smoke] ok remove party ${PARTY_CODE}"
    fi
fi

if [ -n "${EXIT_REASON:-}" ]; then
    echo "[smoke] FAIL exit=${EXIT_REASON}"
    exit "${EXIT_REASON}"
fi
echo "[smoke] ALL PROBES PASS"
exit 0
