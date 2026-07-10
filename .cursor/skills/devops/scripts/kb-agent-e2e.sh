#!/usr/bin/env bash
# kb agent 端到端自测：登录 → 建 thread → 跑 CopilotKit SSE
set -euo pipefail

BASE_URL="${BASE_URL:-https://localhost:3000}"
EMAIL="${E2E_EMAIL:-agent-e2e@cursor.local}"
PASSWORD="${E2E_PASSWORD:-agent-e2e-pass}"
KB_ID="${KB_ID:-kb_default}"
QUESTION="${QUESTION:-怎么开电子发票}"

json_field() {
  node -pe "JSON.parse(require('fs').readFileSync(0,'utf8'))$1"
}

echo "[devops/e2e/agent] sign-in $EMAIL"
TOKEN=$(curl -sk -X POST "$BASE_URL/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | json_field '.token')

echo "[devops/e2e/agent] create kb conversation"
THREAD=$(curl -sk -X POST "$BASE_URL/conversations/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"kb"}' | json_field '.conversation.id')

RUN_ID=$(node -pe 'crypto.randomUUID()')
MSG_ID=$(node -pe 'crypto.randomUUID()')

echo "[devops/e2e/agent] thread=$THREAD kbId=$KB_ID"
echo "[devops/e2e/agent] question: $QUESTION"
echo "--- SSE ---"

curl -sk -N -X POST "$BASE_URL/copilotkit/agent/kb/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d "{\"threadId\":\"$THREAD\",\"runId\":\"$RUN_ID\",\"tools\":[],\"context\":[],\"forwardedProps\":{},\"state\":{\"kbId\":\"$KB_ID\"},\"messages\":[{\"id\":\"$MSG_ID\",\"role\":\"user\",\"content\":\"$QUESTION\"}]}"

echo
echo "--- done ---"
