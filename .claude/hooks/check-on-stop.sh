#!/bin/sh
# Stop hook: run `pnpm check` before Claude ends a turn.
#
# Passing checks: exit 0 with no output, so the turn ends normally.
# Failing checks on a first stop: print {"decision":"block","reason":...} so
# Claude keeps working, with the tail of the failure output as the reason.
# Failing checks while stop_hook_active is true (Claude is already continuing
# because of this hook): allow the stop and show the failure to the user via
# systemMessage, so a failure Claude cannot fix does not loop.
#
# Reference: https://code.claude.com/docs/en/hooks (Stop input, Stop decision control).

input=$(cat)

# Read stop_hook_active and cwd from the stdin JSON with node, which pnpm
# already requires. Prints "true" or "false", then the cwd.
parsed=$(printf '%s' "$input" | node -e '
let text = "";
process.stdin.on("data", (chunk) => { text += chunk; });
process.stdin.on("end", () => {
  let data = {};
  try { data = JSON.parse(text) ?? {}; } catch { data = {}; }
  console.log(data.stop_hook_active === true ? "true" : "false");
  console.log(String(data.cwd || ""));
});
')
active=$(printf '%s\n' "$parsed" | sed -n 1p)
cwd=$(printf '%s\n' "$parsed" | sed -n 2p)

# Run in the checkout Claude is working in. CLAUDE_PROJECT_DIR stays on the
# directory the session started in, which is wrong when Claude works in a git
# worktree, so prefer the repository that contains the session's cwd.
root=""
if [ -n "$cwd" ] && [ -d "$cwd" ]; then
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)
fi
if [ -z "$root" ] || [ ! -f "$root/package.json" ]; then
  root=${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
fi

log=$(mktemp "${TMPDIR:-/tmp}/check-on-stop.XXXXXX")
trap 'rm -f "$log"' EXIT

if (cd "$root" && pnpm check) >"$log" 2>&1; then
  exit 0
fi

# Keep the reason short: last 40 lines, each clipped to 300 characters.
ACTIVE="$active" ROOT="$root" node -e '
const { readFileSync } = require("node:fs");
const lines = readFileSync(process.argv[1], "utf8").split(/\r?\n/);
if (lines.at(-1) === "") lines.pop();
const tail = lines.slice(-40).map((line) => line.slice(0, 300)).join("\n");
const head = "`pnpm check` failed in " + process.env.ROOT + ". Last lines of output:\n\n";
const out = process.env.ACTIVE === "true"
  ? { systemMessage: head + tail + "\n\nThe Stop hook already asked Claude to fix this once; stopping anyway." }
  : { decision: "block", reason: head + tail + "\n\nFix every failure, run `pnpm check` again, then finish." };
console.log(JSON.stringify(out));
' "$log"
exit 0
