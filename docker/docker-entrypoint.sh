#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  set -- "${APP_MODE:-telegram}"
fi

mode="$1"
shift || true

case "$mode" in
  telegram)
    exec node src/telegram/bot.js "$@"
    ;;
  mcp)
    exec node src/server.js "$@"
    ;;
  cli|tv)
    exec node src/cli/index.js "$@"
    ;;
  *)
    exec "$mode" "$@"
    ;;
esac
