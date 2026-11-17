#!/bin/sh
# SessionStart hook: notice pull requests merged on GitHub since main was last
# pulled, so a new session does not work from a stale main and docs/next.md.
#
# Fetches origin/main quietly with a short timeout. When local main is behind:
# - fast-forwards main, but only when the main checkout is on main, its
#   tracked files are clean and `git merge --ff-only` succeeds;
# - otherwise changes nothing.
# Either way it prints JSON whose hookSpecificOutput.additionalContext tells
# Claude what was merged, whether app code changed, and to finish the
# after-merge routine in AGENTS.md; systemMessage tells the person.
#
# Then it runs `pnpm -s wb lanes` in the main checkout, which compares the
# board's lanes with GitHub (docs/dev-loop.md, "Running the loop locally").
# When it reports drift, the report joins additionalContext and systemMessage
# says how many cards drifted. A stopped API, a missing gh or pnpm, a main
# without the command, or any error: the report is left out.
#
# Up to date, no drift, offline, or anything unexpected: no output. Always
# exits 0.
#
# Reference: https://code.claude.com/docs/en/hooks (SessionStart input,
# matchers, additionalContext, systemMessage).

FETCH_TIMEOUT=8

input=$(cat)

# Start from the session's cwd when the stdin JSON has one; it may be a
# worktree under .claude/worktrees/.
cwd=$(printf '%s' "$input" | node -e '
let text = "";
process.stdin.on("data", (chunk) => { text += chunk; });
process.stdin.on("end", () => {
  let data = {};
  try { data = JSON.parse(text) ?? {}; } catch { data = {}; }
  console.log(String(data.cwd || ""));
});
' 2>/dev/null)
start=""
for dir in "$cwd" "$CLAUDE_PROJECT_DIR" "$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)"; do
  if [ -n "$dir" ] && [ -d "$dir" ] && git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
    start=$dir
    break
  fi
done
[ -n "$start" ] || exit 0

# The main checkout is the first entry of the worktree list, wherever the
# session started.
repo=$(git -C "$start" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')
[ -n "$repo" ] && [ -d "$repo" ] || exit 0

# Everything about main runs in this function, called in a subshell below, so
# each early `exit 0` ends only this part and the lanes report still runs.
main_behind() {
git -C "$repo" rev-parse --verify --quiet refs/heads/main >/dev/null || exit 0

# Fetch with a watchdog, since macOS has no timeout(1). All output goes to
# /dev/null so no leftover process holds the hook's stdout open.
GIT_TERMINAL_PROMPT=0 git -C "$repo" fetch --quiet --no-tags origin main >/dev/null 2>&1 </dev/null &
fetch_pid=$!
(
  sleep "$FETCH_TIMEOUT" &
  sleep_pid=$!
  trap 'kill "$sleep_pid"; exit 0' TERM
  wait "$sleep_pid"
  kill "$fetch_pid"
) >/dev/null 2>&1 </dev/null &
watch_pid=$!
wait "$fetch_pid" 2>/dev/null
fetch_status=$?
{ kill "$watch_pid"; wait "$watch_pid"; } 2>/dev/null
[ "$fetch_status" -eq 0 ] || exit 0

old=$(git -C "$repo" rev-parse --verify --quiet refs/heads/main) || exit 0
new=$(git -C "$repo" rev-parse --verify --quiet refs/remotes/origin/main) || exit 0
behind=$(git -C "$repo" rev-list --count "$old..$new" 2>/dev/null) || exit 0
[ "$behind" -gt 0 ] 2>/dev/null || exit 0
ahead=$(git -C "$repo" rev-list --count "$new..$old" 2>/dev/null || echo 0)

merges=$(git -C "$repo" log --merges --format=%s "$old..$new" 2>/dev/null)
app_files=$(git -C "$repo" diff --name-only "$old...$new" -- apps packages 2>/dev/null)
if [ -n "$app_files" ]; then app_changed=yes; else app_changed=no; fi

# Fast-forward only when it cannot change files under someone's work.
branch=$(git -C "$repo" symbolic-ref --quiet --short HEAD 2>/dev/null)
dirty=$(git -C "$repo" status --porcelain --untracked-files=no 2>/dev/null)
action=reminded
reason=""
if [ "$ahead" -gt 0 ]; then
  reason="local main has $ahead commit(s) that origin/main does not"
elif [ "$branch" != "main" ]; then
  reason="the main checkout is on ${branch:-a detached HEAD}, not main"
elif [ -n "$dirty" ]; then
  reason="the main checkout has uncommitted changes"
elif git -C "$repo" merge --ff-only --quiet "$new" >/dev/null 2>&1 </dev/null; then
  action=fast_forwarded
else
  reason="git merge --ff-only refused (untracked files in the way?)"
fi

ACTION="$action" REASON="$reason" BEHIND="$behind" REPO="$repo" \
OLD="$old" NEW="$new" MERGES="$merges" APP_CHANGED="$app_changed" \
APP_FILES="$app_files" node -e '
const env = process.env;
const n = Number(env.BEHIND);
const commits = n === 1 ? "1 commit" : n + " commits";
const range = env.OLD.slice(0, 7) + ".." + env.NEW.slice(0, 7);
const merges = env.MERGES.split("\n").filter(Boolean);
const branches = merges
  .map((s) => (s.match(/^Merge pull request #\d+ from [^/\s]+\/(\S+)/) || [])[1])
  .filter(Boolean);
const files = env.APP_FILES.split("\n").filter(Boolean);

const lines = [];
if (env.ACTION === "fast_forwarded") {
  lines.push("The SessionStart hook fast-forwarded main in " + env.REPO + " by " + commits + " (" + range + ") to origin/main.");
} else {
  lines.push("Local main in " + env.REPO + " is " + commits + " behind origin/main (" + range + "). The SessionStart hook changed nothing because " + env.REASON + ".");
}
if (merges.length) {
  lines.push("Merged pull requests:");
  for (const s of merges) lines.push("- " + s);
} else {
  lines.push("No merge commits in the range.");
}
if (env.APP_CHANGED === "yes") {
  lines.push("App code changed (" + files.length + " file(s) under apps/ or packages/), so run `pnpm wb restart api`.");
} else {
  lines.push("No app code changed under apps/ or packages/, so the API needs no restart.");
}
const todo = [];
if (env.ACTION !== "fast_forwarded") todo.push("bring main up to date (switch to main and pull) once that is safe, or tell Mikael why it is not");
todo.push("delete the merged branches" + (branches.length ? " (" + branches.map((b) => "`" + b + "`").join(", ") + ")" : "") + ", removing any worktree under .claude/worktrees/ that has one checked out first");
if (env.APP_CHANGED === "yes") todo.push("run `pnpm wb restart api`");
todo.push("read docs/next.md again from the updated main");
lines.push("Finish the after-merge routine in AGENTS.md: " + todo.join("; ") + ".");

const short = env.ACTION === "fast_forwarded"
  ? "main fast-forwarded by " + commits + " from origin/main."
  : "main is " + commits + " behind origin/main; not pulled (" + env.REASON + ").";
console.log(JSON.stringify({
  systemMessage: short,
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
}));
' 2>/dev/null
}
behind_json=$(main_behind)

# The lanes report prints only a summary line when nothing drifted, or when
# it has no board or GitHub to compare, so more than one line means drift.
lanes=$(cd "$repo" 2>/dev/null && pnpm -s wb lanes 2>/dev/null </dev/null) || lanes=""
[ "$(printf '%s\n' "$lanes" | grep -c .)" -gt 1 ] || lanes=""
[ -n "$behind_json" ] || [ -n "$lanes" ] || exit 0

BEHIND_JSON="$behind_json" LANES="$lanes" node -e '
const env = process.env;
let out = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "" } };
if (env.BEHIND_JSON) out = JSON.parse(env.BEHIND_JSON);
if (env.LANES) {
  const lines = env.LANES.split("\n").filter(Boolean);
  const drifted = lines.length - 1;
  const text = "The board has drifted from GitHub; `pnpm wb lanes` reports:\n" + lines.join("\n") +
    "\nTell Mikael, and move the cards only where he asks.";
  const ctx = out.hookSpecificOutput.additionalContext;
  out.hookSpecificOutput.additionalContext = ctx ? ctx + "\n\n" + text : text;
  const short = drifted + " card" + (drifted === 1 ? "" : "s") + " on the board drifted from GitHub; see `pnpm wb lanes`.";
  out.systemMessage = out.systemMessage ? out.systemMessage + " " + short : short;
}
console.log(JSON.stringify(out));
' 2>/dev/null || { [ -z "$behind_json" ] || printf '%s\n' "$behind_json"; }
exit 0
