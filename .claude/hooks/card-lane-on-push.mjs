// PreToolUse hook (Bash, `if: Bash(git push *)`): refuse to push a card's
// branch while the card is not in a lane where work happens, so the board
// follows the work instead of drifting behind it (card #20).
//
// A card's branch is `wb/<card id>-<title>`, the same convention the webhook
// uses (apps/api/src/github/webhook.ts). The branch is taken from the push
// command when it names one, else from the branch checked out in the hook's
// cwd. The card's lane is read from the running board API
// (WB_API_URL, default http://localhost:3000/api).
//
// - in_progress, review, needs_input: allowed, nothing printed.
// - backlog, ready, done, or a card the board does not have: denied, with a
//   reason that tells Claude how to put the card in the right lane first.
// - Not a card branch, no API running, or anything unexpected: allowed. The
//   guard never blocks work because the board is down; `pnpm wb lanes`
//   reports drift afterwards.
//
// Reference: https://code.claude.com/docs/en/hooks (PreToolUse input:
// tool_input.command and cwd; deny through hookSpecificOutput with
// permissionDecision "deny" and permissionDecisionReason, which Claude sees).
/* global fetch, AbortSignal */
import { execFileSync } from "node:child_process";
import process from "node:process";

const API = (process.env.WB_API_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const WORKING = new Set(["in_progress", "review", "needs_input"]);

function readStdin() {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
  });
}

/** The card id a push targets, or undefined when it is not a card's branch. */
export function cardIdForPush(command, currentBranch) {
  if (!/\bgit\b[^;&|]*\bpush\b/.test(command)) return undefined;
  // A refspec such as `wb/17-x`, `HEAD:wb/17-x` or `refs/heads/wb/17-x`.
  const named = /(?:^|[\s:/])wb\/(\d+)-[^\s:]*/.exec(command.replace(/https?:\/\/\S+/g, ""));
  if (named) return named[1];
  // Only `git push` or `git push <remote>` pushes the checked-out branch; a
  // command that names its own refspec and no card branch is not a card push.
  const args = /\bpush\b([^;&|]*)/.exec(command)?.[1].trim().split(/\s+/).filter((a) => a && !a.startsWith("-")) ?? [];
  if (args.length > 1) return undefined;
  const current = /^wb\/(\d+)-/.exec(currentBranch ?? "");
  return current?.[1];
}

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function hint(id, state) {
  switch (state) {
    case "backlog":
      return `move card #${id} to Ready as its owner, then pick it (pick_card, or POST /api/cards/${id}/pick)`;
    case "ready":
      return `pick card #${id} first (pick_card, or POST /api/cards/${id}/pick), so the board shows it In progress`;
    case "done":
      return `enter a new card for further work and push on that card's branch instead`;
    default:
      return `put card #${id} in a working lane first`;
  }
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }),
  );
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin()) ?? {};
  } catch {
    return;
  }
  const command = String(input.tool_input?.command ?? "");
  const cwd = String(input.cwd || process.cwd());
  const id = cardIdForPush(command, /\bgit\b[^;&|]*\bpush\b/.test(command) ? currentBranch(cwd) : undefined);
  if (!id) return;

  let res;
  try {
    res = await fetch(`${API}/cards/${id}`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return; // no board running: allow
  }
  if (res.status === 404) {
    deny(`The workbench board has no card #${id}, so this push would not be tracked. Enter the card on the board first, or push on the branch of an existing card.`);
    return;
  }
  if (!res.ok) return;
  const state = (await res.json())?.card?.status?.state;
  if (typeof state !== "string" || WORKING.has(state)) return;
  deny(`Card #${id} is ${state.replace("_", " ")} on the workbench board, but this push is work on it. To keep the board in step with GitHub, ${hint(id, state)}${state === "done" ? "." : ", then push again."}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
