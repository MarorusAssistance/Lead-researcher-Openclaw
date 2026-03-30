#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: run-direct-agent.sh <agent> <session-id> <payload-json-file>" >&2
  exit 1
fi

agent_id="$1"
session_id="$2"
payload_file="$3"

payload="$(python3 - <<'PY' "$payload_file"
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
print(json.dumps(json.loads(path.read_text(encoding='utf-8')), ensure_ascii=False), end="")
PY
)"

openclaw agent \
  --agent "$agent_id" \
  --local \
  --session-id "$session_id" \
  --json \
  --timeout 240 \
  --message "$payload"
