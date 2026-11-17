#!/bin/sh
# PreToolUse hook on Bash: the push guard for card branches (card #20, see
# packages/dev/src/pushGuardCli.ts). There is no `if` filter in settings.json,
# because a permission rule may not match `cd <dir> && git push` or
# `git -C <dir> push`; instead this wrapper hands only commands that mention
# "push" to node, so every other Bash call costs one shell. Always exits 0;
# a denial is JSON on stdout.
input=$(cat)
case "$input" in
  *push*) printf '%s' "$input" | node "$CLAUDE_PROJECT_DIR"/packages/dev/src/pushGuardCli.ts 2>/dev/null ;;
esac
exit 0
