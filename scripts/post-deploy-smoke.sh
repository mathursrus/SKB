#!/usr/bin/env bash
# ============================================================================
# SKB - Post-deploy authenticated smoke (project rule #8)
# ============================================================================
#
# Runs after Azure deploys a fresh build, BEFORE the workflow marks success.
# Signs up a brand-new throwaway tenant against the freshly-deployed app,
# exercises the user-facing routes that have a history of breaking
# (issue #93 was /staff), then deletes the entire tenant via the same
# DELETE /r/:loc/api/tenant route a real owner uses to leave the platform.
#
# A deploy is not "successful" until this script exits 0. This is the
# structural fix for the recurring "user as tester" pattern documented in
# docs/retrospectives/sid.mathur@gmail.com-issue-93-staff-503-postmortem.md.
#
# Design choice (per code review): no special admin/cleanup endpoints, no
# persistent test credentials. Each run is self-contained:
#   1. POST /api/signup (auto-cookie)
#   2. GET  /staff
#   3. GET  /queue/state
#   4. POST /host/queue/add  → capture party id
#   5. GET  /host/queue       → assert party present
#   6. POST /host/queue/:id/remove
#   7. DELETE /r/:loc/api/tenant  (full cascade — leaves no trace in prod)
#
# Required env:
#   SMOKE_BASE_URL   base URL of the deployed environment
#                    (e.g. https://skb-waitlist.azurewebsites.net)
#
# Exit codes:
#   0  — all probes succeeded, tenant deleted
#   1  — signup failed (auth/db broken, or rate-limited)
#   2  — /staff failed (regression of the issue #93 class)
#   3  — /queue/state failed (waitlist read path broken)
#   4  — add party failed (waitlist write path broken)
#   5  — list queue failed or the added party isn't there
#   6  — remove party failed
#   7  — tenant delete failed (leaves the throwaway tenant behind — not a
#        customer impact, but accumulates state across runs)
# ============================================================================

set -u  # not -e so we can capture failures and report them all

: "${SMOKE_BASE_URL:?SMOKE_BASE_URL must be set}"

SHA_SHORT="${GITHUB_SHA:-localdev}"
SHA_SHORT="${SHA_SHORT:0:8}"
RUN_ID="${GITHUB_RUN_ID:-$RANDOM$RANDOM}"
# IANA-reserved .test TLD so this can never collide with a real address.
SMOKE_EMAIL="smoke-${SHA_SHORT}-${RUN_ID}@example.test"
SMOKE_PASSWORD="smoke-pw-$(head -c 16 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
SMOKE_RESTAURANT="Smoke ${SHA_SHORT} ${RUN_ID}"
SMOKE_CITY="Smoketown"
SMOKE_OWNER_NAME="Smoke Owner"
PARTY_NAME="Smoke ${SHA_SHORT}"
# Phone needs to be exactly 10 digits, valid-shaped. 555 prefix + 7 random digits.
PHONE="555$(printf '%07d' $(( RANDOM % 10000000 )))"
COOKIE_JAR="$(mktemp)"

cleanup_jar() { rm -f "$COOKIE_JAR"; }
trap cleanup_jar EXIT

echo "[smoke] base=${SMOKE_BASE_URL} email=${SMOKE_EMAIL} party='${PARTY_NAME}'"

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

# ─── Probe 1: signup (creates tenant, mints cookie automatically) ──────
SIGNUP_BODY=$(cat <<EOF
{"restaurantName":"${SMOKE_RESTAURANT}","city":"${SMOKE_CITY}","ownerName":"${SMOKE_OWNER_NAME}","email":"${SMOKE_EMAIL}","password":"${SMOKE_PASSWORD}","tosAccepted":true}
EOF
)
SIGNUP_RESP=$(curl_with_code POST "${SMOKE_BASE_URL}/api/signup" "$SIGNUP_BODY" save-cookie)
SIGNUP_CODE=$(extract_code "$SIGNUP_RESP")
SIGNUP_BODY_ONLY=$(extract_body "$SIGNUP_RESP")
if [ "$SIGNUP_CODE" != "201" ]; then
    echo "[smoke] FAIL signup: HTTP ${SIGNUP_CODE}"
    echo "[smoke] body: ${SIGNUP_BODY_ONLY}"
    exit 1
fi
# Signup returns { location: { id: "<slug>", name: "..." } }. We need both
# the slug for routing and the name for the tenant-delete confirmName guard.
TENANT_SLUG=$(echo "$SIGNUP_BODY_ONLY" | python -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('location', {}).get('id', ''))
" 2>/dev/null)
TENANT_NAME=$(echo "$SIGNUP_BODY_ONLY" | python -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('location', {}).get('name', ''))
" 2>/dev/null)
if [ -z "$TENANT_SLUG" ] || [ -z "$TENANT_NAME" ]; then
    echo "[smoke] FAIL signup: could not parse location id/name from response"
    echo "[smoke] body: ${SIGNUP_BODY_ONLY}"
    exit 1
fi
echo "[smoke] ok signup -> 201 slug=${TENANT_SLUG} name='${TENANT_NAME}'"

# ─── Probe 2: GET /staff (the issue #93 regression surface) ────────────
STAFF_RESP=$(curl_with_code GET "${SMOKE_BASE_URL}/r/${TENANT_SLUG}/api/staff" "" with-cookie)
STAFF_CODE=$(extract_code "$STAFF_RESP")
STAFF_BODY=$(extract_body "$STAFF_RESP")
if [ "$STAFF_CODE" != "200" ]; then
    echo "[smoke] FAIL /staff: HTTP ${STAFF_CODE}"
    echo "[smoke] body: ${STAFF_BODY}"
    EXIT_REASON=2
elif ! echo "$STAFF_BODY" | grep -q "\"$SMOKE_EMAIL\""; then
    echo "[smoke] FAIL /staff: response missing owner row for ${SMOKE_EMAIL}"
    echo "[smoke] body: ${STAFF_BODY}"
    EXIT_REASON=2
else
    echo "[smoke] ok /staff -> 200 with owner row"
fi

# ─── Probe 3: GET /queue/state (waitlist read path) ─────────────────────
QUEUE_STATE_RESP=$(curl_with_code GET "${SMOKE_BASE_URL}/r/${TENANT_SLUG}/api/queue/state" "" with-cookie)
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
ADD_RESP=$(curl_with_code POST "${SMOKE_BASE_URL}/r/${TENANT_SLUG}/api/host/queue/add" "$ADD_BODY" with-cookie)
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

# ─── Probe 5: GET /host/queue (assert party present, capture id) ───────
PARTY_ID=""
if [ -n "$PARTY_CODE" ]; then
    LIST_RESP=$(curl_with_code GET "${SMOKE_BASE_URL}/r/${TENANT_SLUG}/api/host/queue" "" with-cookie)
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
        # The :id in /host/queue/:id/remove is the Mongo ObjectId, not the
        # human-readable code. Pull it out of the matching party object.
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

# ─── Probe 6: POST /host/queue/:id/remove ───────────────────────────────
if [ -n "$PARTY_ID" ]; then
    REMOVE_BODY='{"reason":"no_show"}'
    REMOVE_RESP=$(curl_with_code POST "${SMOKE_BASE_URL}/r/${TENANT_SLUG}/api/host/queue/${PARTY_ID}/remove" "$REMOVE_BODY" with-cookie)
    REMOVE_CODE=$(extract_code "$REMOVE_RESP")
    if [ "$REMOVE_CODE" != "200" ]; then
        echo "[smoke] WARN remove party ${PARTY_CODE}: HTTP ${REMOVE_CODE}"
        echo "[smoke] body: $(extract_body "$REMOVE_RESP")"
        EXIT_REASON="${EXIT_REASON:-6}"
    else
        echo "[smoke] ok remove party ${PARTY_CODE}"
    fi
fi

# ─── Cleanup: DELETE the entire throwaway tenant ───────────────────────
# Always attempt cleanup even if probes failed, so we don't leave
# throwaway tenants behind in prod Cosmos. This uses the same route a
# real owner would hit to leave the platform — no test-special endpoints.
DELETE_BODY=$(cat <<EOF
{"confirmName":"${TENANT_NAME}"}
EOF
)
DELETE_RESP=$(curl_with_code DELETE "${SMOKE_BASE_URL}/r/${TENANT_SLUG}/api/tenant" "$DELETE_BODY" with-cookie)
DELETE_CODE=$(extract_code "$DELETE_RESP")
if [ "$DELETE_CODE" != "200" ]; then
    echo "[smoke] WARN tenant delete: HTTP ${DELETE_CODE}"
    echo "[smoke] body: $(extract_body "$DELETE_RESP")"
    EXIT_REASON="${EXIT_REASON:-7}"
else
    echo "[smoke] ok tenant delete -> 200"
fi

if [ -n "${EXIT_REASON:-}" ]; then
    echo "[smoke] FAIL exit=${EXIT_REASON}"
    exit "${EXIT_REASON}"
fi
echo "[smoke] ALL PROBES PASS"
exit 0
