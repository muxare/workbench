// The push guard, run as the project's PreToolUse hook on Bash (card #20):
// it refuses a push of a card's branch `wb/<id>-…` while the board shows card
// <id> outside a working lane, so the board follows the work instead of
// drifting behind it. See pushGuard.ts for how a command is read.
//
// Allowed, with nothing printed: no push in the command, no card branch, a
// card In progress, in Review or Needs input, or a board API that does not
// answer (the guard never blocks work because the board is down; `pnpm wb
// lanes` reports drift afterwards). Otherwise it denies the call with a reason
// Claude sees.
//
// Reference: https://code.claude.com/docs/en/hooks (PreToolUse input:
// tool_input.command and cwd; a deny is hookSpecificOutput with
// permissionDecision "deny" and permissionDecisionReason).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cardIdFromBranch } from "@workbench/shared";
import { apiUrl } from "./lanesCli.ts";
import { pushesIn, refusal } from "./pushGuard.ts";

const TIMEOUT_MS = 2_000;

function checkedOut(dir: string): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/** The card's lane; undefined when the board has no such card; null when the board cannot say. */
async function laneOf(id: string): Promise<string | undefined | null> {
  try {
    const res = await fetch(`${apiUrl()}/api/cards/${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404) return undefined;
    if (!res.ok) return null;
    const body = (await res.json()) as { card?: { status?: { state?: unknown } } };
    const state = body.card?.status?.state;
    return typeof state === "string" ? state : null;
  } catch {
    return null;
  }
}

async function readStdin(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}

export async function guard(input: { tool_input?: { command?: unknown }; cwd?: unknown }): Promise<string | undefined> {
  const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
  if (!/\bpush\b/.test(command)) return undefined;
  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
  const ids = new Set<string>();
  for (const push of pushesIn(command)) {
    const dir = resolve(cwd, push.dir ?? ".");
    for (const branch of push.branches) {
      const name = branch === "HEAD" ? checkedOut(dir) : branch;
      const id = name === undefined ? undefined : cardIdFromBranch(name);
      if (id !== undefined) ids.add(id);
    }
  }
  const reasons: string[] = [];
  for (const id of ids) {
    const lane = await laneOf(id);
    if (lane === null) continue;
    const reason = refusal(id, lane);
    if (reason !== undefined) reasons.push(reason);
  }
  return reasons.length > 0 ? reasons.join(" ") : undefined;
}

async function main(): Promise<void> {
  let input: Parameters<typeof guard>[0];
  try {
    input = JSON.parse(await readStdin()) as Parameters<typeof guard>[0];
  } catch {
    return;
  }
  const reason = await guard(input ?? {});
  if (reason === undefined) return;
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }),
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
