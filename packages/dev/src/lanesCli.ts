// The reading half of `pnpm wb lanes` (lanes.ts holds the check itself): the
// board from the running API, and the repository's pull requests and branches
// from the `gh` CLI. A report, so it always exits 0: an API that is not
// running, or a GitHub it cannot read, is said and not treated as a failure.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findDrift, formatDrift, logsNeeded, type BoardCard, type GhPullRequest, type LogEvent } from "./lanes.ts";
import { hookRepo, services } from "./services.ts";

const run = promisify(execFile);
const GH_TIMEOUT_MS = 8_000;
const HTTP_TIMEOUT_MS = 3_000;

/**
 * The API `pnpm wb` starts listens on the port in the services table, as `wb
 * status` reports it (.run/api.json holds only its PID). `WORKBENCH_API_URL`
 * overrides it, as it does for the MCP server.
 */
export function apiUrl(): string {
  const override = process.env.WORKBENCH_API_URL?.replace(/\/+$/, "");
  if (override) return override;
  const port = services.find((s) => s.name === "api")?.port ?? 3000;
  return `http://localhost:${String(port)}`;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} answered ${String(res.status)}`);
  return res.json();
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await run("gh", args, { timeout: GH_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function readGithub(): Promise<{ prs: GhPullRequest[]; branches: string[] }> {
  const [prs, branches] = await Promise.all([
    gh(["pr", "list", "--repo", hookRepo, "--state", "all", "--limit", "1000", "--json", "number,state,isDraft,headRefName,body"]),
    gh(["api", "--paginate", `repos/${hookRepo}/branches?per_page=100`, "--jq", ".[].name"]),
  ]);
  return { prs: JSON.parse(prs) as GhPullRequest[], branches: branches.split("\n").filter(Boolean) };
}

export async function lanes(json: boolean): Promise<void> {
  const base = apiUrl();
  const say = (message: string, extra: Record<string, unknown>) => {
    console.log(json ? JSON.stringify({ ...extra, message }) : message);
  };

  let cards: BoardCard[];
  try {
    cards = ((await getJson(`${base}/api/board`)) as { cards: BoardCard[] }).cards;
  } catch {
    say(`lanes: the API is not running at ${base}, so there is no board to compare; start it with \`pnpm wb start api\`.`, { api: "not_running", url: base });
    return;
  }

  let github: Awaited<ReturnType<typeof readGithub>>;
  try {
    github = await readGithub();
  } catch (err) {
    const why = err instanceof Error ? err.message.split("\n")[0] : String(err);
    say(`lanes: could not read ${hookRepo} with gh: ${why ?? "unknown error"}`, { github: "unreadable" });
    return;
  }

  const logs = new Map<string, LogEvent[]>();
  for (const id of logsNeeded(cards, github.prs, github.branches)) {
    try {
      logs.set(id, ((await getJson(`${base}/api/cards/${encodeURIComponent(id)}`)) as { log: LogEvent[] }).log);
    } catch {
      // Without its log the card is held to `review` alone; the line it gets says what to look at.
    }
  }

  const report = findDrift(cards, github.prs, github.branches, logs);
  console.log(json ? JSON.stringify(report, null, 2) : formatDrift(report));
}
