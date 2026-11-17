// `pnpm wb lanes`: where the board and GitHub disagree about a card's lane.
// The webhook (apps/api/src/github/webhook.ts) moves cards as deliveries
// arrive, so a delivery lost while the forwarder was down, or one that could
// not move a card nobody had picked, leaves the card behind GitHub. This file
// is the pure part: given the board's cards and the repository's pull
// requests and branches, it says which cards sit in another lane than GitHub
// implies. It reads and moves nothing; lanesCli.ts does the reading.
//
// A pull request or branch names its card the way the webhook reads it: the
// body line `Workbench: #<id>` wins over the branch `wb/<id>-<title>`.
// What GitHub implies for a card, strongest evidence first:
// - an open, non-draft pull request: `review`, or `in_progress` when the
//   card's latest `changes_requested` or failed `check_ran` on that pull
//   request is newer than its latest `review_requested` (sent back, still open);
// - a merged pull request: `done`;
// - a draft pull request, or a branch no pull request was opened from:
//   `in_progress`.
// A pull request closed without merging says nothing, and nor does a card
// GitHub never mentions. `needs_input` counts as `in_progress`.
import { cardIdFromBody, cardIdFromBranch, type CardStatus } from "@workbench/shared";

export type BoardCard = { id: string; title: string; status: { state: CardStatus } };

/** One pull request as `gh pr list --json number,state,isDraft,headRefName,body` gives it. */
export type GhPullRequest = { number: number; state: "OPEN" | "MERGED" | "CLOSED"; isDraft: boolean; headRefName: string; body: string | null };

/** Just the part of a card log event the check reads. */
export type LogEvent = { type: string; pull_request?: number; passed?: boolean };

export type Lane = "in_progress" | "review" | "done";

export type Evidence =
  | { kind: "pull_request"; number: number; state: "open" | "merged" | "draft"; branch: string }
  | { kind: "branch"; branch: string };

export type Mismatch = {
  card_id: string;
  title: string;
  board: CardStatus;
  expected: Lane;
  /** Other lanes that would also be right, such as `in_progress` for a card sent back with its pull request still open. */
  also_accepted: Lane[];
  evidence: Evidence;
  hint: string;
};

type Expectation = { lanes: Lane[]; evidence: Evidence; openPrs: number[] };

const cardIdForPullRequest = (pr: GhPullRequest) => cardIdFromBody(pr.body) ?? cardIdFromBranch(pr.headRefName);

/** What GitHub implies for each card it names, before reading any card log. */
function expectations(prs: readonly GhPullRequest[], branches: readonly string[]): Map<string, Expectation> {
  const byCard = new Map<string, GhPullRequest[]>();
  for (const pr of prs) {
    const id = cardIdForPullRequest(pr);
    if (id !== undefined) byCard.set(id, [...(byCard.get(id) ?? []), pr]);
  }
  const prBranches = new Set(prs.map((pr) => pr.headRefName));
  const bareBranches = new Map<string, string>();
  for (const branch of [...branches].sort()) {
    const id = cardIdFromBranch(branch);
    if (id !== undefined && !prBranches.has(branch) && !bareBranches.has(id)) bareBranches.set(id, branch);
  }

  const result = new Map<string, Expectation>();
  for (const id of new Set([...byCard.keys(), ...bareBranches.keys()])) {
    // Newest pull request first, so the evidence names the latest one.
    const cardPrs = [...(byCard.get(id) ?? [])].sort((a, b) => b.number - a.number);
    const open = cardPrs.filter((pr) => pr.state === "OPEN" && !pr.isDraft);
    const merged = cardPrs.find((pr) => pr.state === "MERGED");
    const draft = cardPrs.find((pr) => pr.state === "OPEN" && pr.isDraft);
    const bare = bareBranches.get(id);
    const prEvidence = (pr: GhPullRequest, state: "open" | "merged" | "draft"): Evidence => ({
      kind: "pull_request",
      number: pr.number,
      state,
      branch: pr.headRefName,
    });
    if (open[0] !== undefined) {
      result.set(id, { lanes: ["review"], evidence: prEvidence(open[0], "open"), openPrs: open.map((pr) => pr.number) });
    } else if (merged !== undefined) {
      result.set(id, { lanes: ["done"], evidence: prEvidence(merged, "merged"), openPrs: [] });
    } else if (draft !== undefined) {
      result.set(id, { lanes: ["in_progress"], evidence: prEvidence(draft, "draft"), openPrs: [] });
    } else if (bare !== undefined) {
      result.set(id, { lanes: ["in_progress"], evidence: { kind: "branch", branch: bare }, openPrs: [] });
    }
  }
  return result;
}

const lane = (state: CardStatus): CardStatus => (state === "needs_input" ? "in_progress" : state);

/**
 * The cards whose log decides the check: on the board in progress while an
 * open pull request says review. Only their logs need fetching.
 */
export function logsNeeded(cards: readonly BoardCard[], prs: readonly GhPullRequest[], branches: readonly string[]): string[] {
  const expected = expectations(prs, branches);
  return cards.filter((c) => lane(c.status.state) === "in_progress" && expected.get(c.id)?.lanes[0] === "review").map((c) => c.id);
}

/** Whether, on one pull request, the card was sent back after it last asked for review. Logs are oldest first. */
function sentBack(log: readonly LogEvent[], pr: number): boolean {
  let requested = -1;
  let back = -1;
  log.forEach((e, i) => {
    if (e.pull_request !== pr) return;
    if (e.type === "review_requested") requested = i;
    if (e.type === "changes_requested" || (e.type === "check_ran" && e.passed === false)) back = i;
  });
  return back > requested;
}

/** How to bring the board to the lane GitHub implies, by the moves the board allows. */
export function hint(board: CardStatus, expected: Lane): string {
  const approval = "; check the approval first";
  switch (board) {
    case "backlog":
      return {
        in_progress: "move to ready, then pick",
        review: "move to ready, pick, then move to review",
        done: `move to ready, pick, move to review, then review → done${approval}`,
      }[expected];
    case "ready":
      return { in_progress: "pick", review: "pick, then move to review", done: `pick, move to review, then review → done${approval}` }[expected];
    case "needs_input":
      return expected === "review" ? "answer the open question, then move to review" : `answer the open question, move to review, then review → done${approval}`;
    case "in_progress":
      return expected === "review" ? "move in_progress → review" : `move in_progress → review → done${approval}`;
    case "review":
      return expected === "in_progress" ? "move review → in_progress" : `move review → done${approval}`;
    case "done":
      return expected === "review"
        ? "done is final: close the pull request, or move its `Workbench: #<id>` line to a new card"
        : "done is final: delete the branch, or open a new card for the work";
  }
}

/** Every card on the board whose lane differs from what GitHub implies, in card id order. */
export function findDrift(
  cards: readonly BoardCard[],
  prs: readonly GhPullRequest[],
  branches: readonly string[],
  logs: ReadonlyMap<string, readonly LogEvent[]> = new Map(),
): { checked: number; mismatches: Mismatch[] } {
  const expected = expectations(prs, branches);
  const mismatches: Mismatch[] = [];
  let checked = 0;
  for (const card of [...cards].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id))) {
    const exp = expected.get(card.id);
    if (exp === undefined) continue;
    checked++;
    const lanes = [...exp.lanes];
    if (lanes[0] === "review" && exp.openPrs.some((pr) => sentBack(logs.get(card.id) ?? [], pr))) lanes.push("in_progress");
    const board = lane(card.status.state);
    if ((lanes as CardStatus[]).includes(board)) continue;
    const want = lanes[0]!;
    mismatches.push({
      card_id: card.id,
      title: card.title,
      board: card.status.state,
      expected: want,
      also_accepted: lanes.slice(1),
      evidence: exp.evidence,
      hint: hint(card.status.state, want),
    });
  }
  return { checked, mismatches };
}

export function describeEvidence(e: Evidence): string {
  return e.kind === "branch" ? `branch ${e.branch}, no pull request` : `pull request #${String(e.number)} ${e.state} (${e.branch})`;
}

/** The report as text: one line per mismatch, then one summary line. */
export function formatDrift(report: { checked: number; mismatches: Mismatch[] }): string {
  const lines = report.mismatches.map(
    (m) => `#${m.card_id.padEnd(4)} ${m.board} → ${m.expected}  ${describeEvidence(m.evidence)}  hint: ${m.hint}`,
  );
  const n = report.mismatches.length;
  const cards = (k: number) => `${String(k)} card${k === 1 ? "" : "s"}`;
  lines.push(
    n === 0
      ? `lanes: the board matches GitHub for all ${cards(report.checked)} GitHub names.`
      : `lanes: ${cards(n)} of ${String(report.checked)} that GitHub names sit in another lane on the board.`,
  );
  return lines.join("\n");
}
