#!/bin/sh
# PreToolUse hook on Bash: the push guard for card branches (card #20, see
# packages/dev/src/pushGuardCli.ts). There is no `if` filter in settings.json,
# because a permission rule may not match `cd <dir> && git push` or
# `git -C <dir> push`; instead this wrapper hands only commands that mention
# "push" to node, so every other Bash call costs one shell. A denial is JSON
# on stdout. The guard allows a push when the board is down, but if the guard
# itself fails to run, it says so in systemMessage, so a broken guard is not
# mistaken for an allowed push. Always exits 0.
input=$(cat)
case "$input" in
  *push*)
    if ! printf '%s' "$input" | node "$CLAUDE_PROJECT_DIR"/packages/dev/src/pushGuardCli.ts 2>/dev/null; then
      printf '%s' '{"systemMessage":"The card push guard (packages/dev/src/pushGuardCli.ts) failed to run, so this push was not checked against the board; run pnpm install, and pnpm wb lanes afterwards."}'
    fi
    ;;
esac
exit 0
