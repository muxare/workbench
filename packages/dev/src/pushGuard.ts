// What a Bash command pushes, for the push guard (pushGuardCli.ts, run as the
// project's PreToolUse hook on git push). A card's branch is `wb/<id>-<title>`,
// the webhook's convention (`cardIdFromBranch`). This module only reads the
// command; the CLI resolves `HEAD` to the checked-out branch and asks the board.
import { posix } from "node:path";

/** One `git push` in a command: where it runs and the branches it updates. */
export interface Push {
  /** The directory git runs in, from a preceding `cd` and `git -C`, relative to the hook's cwd; undefined for the cwd itself. */
  dir: string | undefined;
  /** Destination branch names; `HEAD` stands for the branch checked out in `dir`. */
  branches: string[];
}

type Token = { op: string } | { word: string };

/** A small shell tokenizer: words with quotes removed, and the operators that separate commands. */
export function tokenize(command: string): Token[] {
  const tokens: Token[] = [];
  let word: string | undefined;
  const flush = (): void => {
    if (word !== undefined) tokens.push({ word });
    word = undefined;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (c === "'" || c === '"') {
      const end = command.indexOf(c, i + 1);
      const stop = end === -1 ? command.length : end;
      word = (word ?? "") + command.slice(i + 1, stop);
      i = stop;
    } else if (c === "\\" && i + 1 < command.length) {
      word = (word ?? "") + command[++i];
    } else if (c === "<" || c === ">") {
      // A redirection: drop a file descriptor such as the 2 in `2>&1`, and
      // let its target start a segment of its own, where it is ignored.
      if (word !== undefined && /^\d+$/.test(word)) word = undefined;
      flush();
      tokens.push({ op: c });
    } else if (c === "&" || c === "|" || c === ";" || c === "\n" || c === "(" || c === ")") {
      flush();
      tokens.push({ op: c });
    } else if (/\s/.test(c)) {
      flush();
    } else {
      word = (word ?? "") + c;
    }
  }
  flush();
  return tokens;
}

function segments(tokens: Token[]): string[][] {
  const out: string[][] = [[]];
  for (const t of tokens) {
    if ("op" in t) out.push([]);
    else out[out.length - 1]!.push(t.word);
  }
  return out.filter((s) => s.length > 0);
}

function join(dir: string | undefined, next: string): string {
  if (next.startsWith("/") || next.startsWith("~") || dir === undefined) return next;
  return posix.join(dir, next);
}

/** git options before the subcommand that take a separate value. */
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);
/** push options that take a separate value. */
const PUSH_VALUE_OPTIONS = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec"]);
/** push options after which the push updates no single card's branch with work. */
const NOT_WORK = new Set(["-d", "--delete", "--tags", "--all", "--mirror", "--prune"]);

function branchOf(refspec: string): string | undefined {
  const spec = refspec.replace(/^\+/, "");
  if (spec.startsWith(":")) return undefined; // `:branch` deletes it
  const dst = spec.includes(":") ? spec.slice(spec.indexOf(":") + 1) : spec;
  if (dst === "HEAD" || dst === "@") return "HEAD";
  return dst.replace(/^refs\/heads\//, "");
}

/** Every `git push` in the command, with its directory and the branches it updates. */
export function pushesIn(command: string): Push[] {
  const pushes: Push[] = [];
  let cwd: string | undefined;
  for (const words of segments(tokenize(command))) {
    // Skip leading environment assignments such as `GIT_TRACE=1 git push`.
    let i = 0;
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]!)) i++;
    const cmd = words[i];
    if (cmd === "cd") {
      const target = words[i + 1];
      cwd = target === undefined || target === "-" ? undefined : join(cwd, target);
      continue;
    }
    if (cmd !== "git") continue;
    let dir = cwd;
    i++;
    while (i < words.length && words[i]!.startsWith("-")) {
      const opt = words[i]!;
      if (GIT_VALUE_OPTIONS.has(opt)) {
        if (opt === "-C" && words[i + 1] !== undefined) dir = join(dir, words[i + 1]!);
        i += 2;
      } else i++;
    }
    if (words[i] !== "push") continue;
    const positional: string[] = [];
    let notWork = false;
    for (let j = i + 1; j < words.length; j++) {
      const arg = words[j]!;
      if (NOT_WORK.has(arg)) notWork = true;
      else if (PUSH_VALUE_OPTIONS.has(arg)) j++;
      else if (!arg.startsWith("-")) positional.push(arg);
    }
    if (notWork) continue;
    const refspecs = positional.slice(1);
    const branches = refspecs.length === 0 ? ["HEAD"] : refspecs.map(branchOf).filter((b): b is string => b !== undefined);
    if (branches.length > 0) pushes.push({ dir, branches });
  }
  return pushes;
}

/** Lanes where a card's branch may receive work. */
export const WORKING_LANES: ReadonlySet<string> = new Set(["in_progress", "review", "needs_input"]);

/** Why a push on card `id` in `state` is refused, or undefined when it may go ahead. `state` undefined means the board has no such card. */
export function refusal(id: string, state: string | undefined): string | undefined {
  if (state === undefined) {
    return `The workbench board has no card #${id}, so this push would not be tracked. Enter the card on the board first, or push on the branch of an existing card.`;
  }
  if (WORKING_LANES.has(state)) return undefined;
  const lane = state.replace("_", " ");
  const fix =
    state === "backlog"
      ? `move card #${id} to Ready as its owner, then pick it (pick_card, or POST /api/cards/${id}/pick), then push again`
      : state === "ready"
        ? `pick card #${id} first (pick_card, or POST /api/cards/${id}/pick), so the board shows it In progress, then push again`
        : state === "done"
          ? "enter a new card for further work and push on that card's branch instead"
          : `put card #${id} in a working lane first, then push again`;
  return `Card #${id} is ${lane} on the workbench board, but this push is work on it. To keep the board in step with GitHub, ${fix}.`;
}
