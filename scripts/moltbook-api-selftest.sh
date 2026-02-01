#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MOLTBOOK_API_KEY:-}" ]]; then
  echo "❌ MOLTBOOK_API_KEY is not set."
  echo "   Set it with: export MOLTBOOK_API_KEY='your-api-key-here'"
  exit 1
fi

BASE_URL="https://www.moltbook.com/api/v1"
AUTH_HEADER="Authorization: Bearer ${MOLTBOOK_API_KEY}"
JSON_HEADER="Content-Type: application/json"

run_check() {
  local label="$1"
  local method="$2"
  local url="$3"
  local data="${4:-}"

  echo ""
  echo "🔎 ${label}"
  if [[ -n "$data" ]]; then
    http_code="$(
      curl -sS -o /dev/null -w "%{http_code}" \
        -X "$method" "$url" \
        -H "$AUTH_HEADER" -H "$JSON_HEADER" \
        -d "$data"
    )"
  else
    http_code="$(
      curl -sS -o /dev/null -w "%{http_code}" \
        -X "$method" "$url" \
        -H "$AUTH_HEADER"
    )"
  fi

  if [[ "$http_code" == "200" || "$http_code" == "204" ]]; then
    echo "✅ OK (${http_code})"
  else
    echo "❌ Failed (${http_code})"
  fi
}

echo "🦞 Moltbook API Self-Test (no posts created)"

run_check "Agent status" "GET" "${BASE_URL}/agents/status"
run_check "DM check" "GET" "${BASE_URL}/agents/dm/check"
run_check "Submolts list" "GET" "${BASE_URL}/submolts"
run_check "Posts feed (new, limit 1)" "GET" "${BASE_URL}/posts?sort=new&limit=1"
run_check "Feed (new, limit 1)" "GET" "${BASE_URL}/feed?sort=new&limit=1"

echo ""
echo "Done."
