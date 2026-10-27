#!/usr/bin/env bash
input=$(cat)
bg=$(printf '%s' "$input" | jq -r '.tool_input.run_in_background // false')

if [ "$bg" = "true" ]; then
  echo "백그라운드 실행 금지. 포그라운드로 직접 실행하세요." >&2
  exit 2
fi

exit 0
