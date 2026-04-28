#!/usr/bin/env bash
# Local diagnostic — tests if your OpenAI key works and which model to use.
# Run from repo root:  bash deploy/test-openai.sh
set -e
cd "$(dirname "$0")/.."

KEY=$(grep '^OPENAI_API_KEY=' .env | cut -d= -f2-)
MODEL=$(grep '^OPENAI_MODEL=' .env | cut -d= -f2-)
MODEL=${MODEL:-gpt-5-nano}

if [ -z "$KEY" ]; then
  echo "ERROR: no OPENAI_API_KEY in .env"; exit 1
fi

echo "== 1. Is the key valid? =="
HTTP=$(curl -s -o /tmp/openai-models.json -w "%{http_code}" \
  https://api.openai.com/v1/models \
  -H "Authorization: Bearer $KEY")
echo "HTTP $HTTP"
if [ "$HTTP" != "200" ]; then
  echo "Key is INVALID or revoked. Response:"
  cat /tmp/openai-models.json
  exit 1
fi
echo "Key is valid."

echo
echo "== 2. Is '$MODEL' on this key? =="
if grep -q "\"id\":\"$MODEL\"" /tmp/openai-models.json; then
  echo "YES — '$MODEL' is available."
else
  echo "NO — '$MODEL' is NOT in your accessible models list."
  echo "ALL models available on this key:"
  grep -o '"id":"[^"]*"' /tmp/openai-models.json | sort -u
  echo
  echo "If the list above is empty, here is the raw API response:"
  cat /tmp/openai-models.json
  exit 1
fi

echo
echo "== 3. Live test — send a tiny chat completion =="
curl -s https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hi in one word.\"}]}" \
  | python3 -m json.tool 2>/dev/null || cat
echo
echo "If you see a 'choices' array with a 'content' field above — your setup works."
echo "If you see an 'error' object — read the message; that's exactly why the helper is failing."
