// The AI teammate's review of a pull request, posted under an account that is
// not Mikael's (docs/dev-loop.md, "The three checks on this repository"). The
// review's content is written elsewhere, by Claude Code following
// .claude/skills/review-pull-request/checks.md; this only posts it. It posts
// either as the workbench's GitHub App, from a session on Mikael's machine
// (`postReview`), or with any token whose account is named, which the
// `ai-review` workflow uses to post as github-actions[bot] (`postReviewAs`).
//
// The review is pinned to the commit that was read: it is posted with that
// commit as `commit_id`, and only while it is still the pull request's head.
// The webhook records the review with its commit (`check_ran` with `check:
// "consistency"`), and the critic gate counts a pass only on the merged head,
// so a review of a commit that is no longer the head would say nothing about
// what lands. A head that moves between the read here and the post is still
// safe: GitHub keeps the review on the commit it names.
import { appLogin, github, installationToken, type Fetch } from "./appToken.ts";

/** GitHub's review events for a verdict; a plain comment records nothing on the board, so it is not offered. */
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES";

export interface ReviewRequest {
  /** "owner/name". */
  repo: string;
  pullNumber: number;
  event: ReviewEvent;
  /** The review's text, in Markdown. */
  body: string;
  /** The full head commit sha the review was written against. */
  head: string;
}

export interface AppCredentials {
  appId: string;
  privateKeyPem: string;
}

/** Who posts: a token, and the login of the account it acts as, such as `github-actions[bot]` for a workflow's GITHUB_TOKEN. */
export interface Reviewer {
  token: string;
  login: string;
}

/** The account a GitHub Actions workflow's GITHUB_TOKEN acts as. */
export const GITHUB_ACTIONS_LOGIN = "github-actions[bot]";

export interface PostedReview {
  id: number;
  url: string;
  commit: string;
  state: string;
}

/** A review that must not be posted; nothing was sent to GitHub's review endpoint. */
export class ReviewRefused extends Error {
  override name = "ReviewRefused";
}

const SHA = /^[0-9a-f]{40}$/;
/** GitHub refuses a review body longer than this many characters. */
const MAX_BODY = 65536;

/** Throws `ReviewRefused` for a request that cannot be a review; checked before anything reaches GitHub. */
export function validateReviewRequest(req: ReviewRequest): void {
  if (!/^[^/\s]+\/[^/\s]+$/.test(req.repo)) throw new ReviewRefused(`'${req.repo}' is not owner/name`);
  if (!Number.isInteger(req.pullNumber) || req.pullNumber < 1) throw new ReviewRefused(`'${String(req.pullNumber)}' is not a pull request number`);
  if (!SHA.test(req.head)) throw new ReviewRefused(`'${req.head}' is not a full 40-character commit sha`);
  if (req.body.trim().length === 0) throw new ReviewRefused("the review body is empty; a verdict without findings or reasons says nothing");
  if (req.body.length > MAX_BODY) throw new ReviewRefused(`the review body is ${String(req.body.length)} characters, more than the ${String(MAX_BODY)} GitHub accepts`);
}

/**
 * Post the review as the App: mint an installation token for the repository
 * and post with it as the App's bot account (`postReviewAs`).
 */
export async function postReview(creds: AppCredentials, req: ReviewRequest, fetchFn: Fetch = fetch): Promise<PostedReview> {
  validateReviewRequest(req);
  const login = await appLogin(creds.appId, creds.privateKeyPem, fetchFn);
  const { token } = await installationToken(creds.appId, creds.privateKeyPem, req.repo, fetchFn);
  return postReviewAs({ token, login }, req, fetchFn);
}

/**
 * Post the review with the reviewer's token: read the pull request, refuse
 * unless it is open, its head is still `req.head`, and it was not opened by
 * the reviewer's own account (GitHub does not let an author approve or request
 * changes on their own pull request), then post the review on that commit.
 */
export async function postReviewAs(reviewer: Reviewer, req: ReviewRequest, fetchFn: Fetch = fetch): Promise<PostedReview> {
  validateReviewRequest(req);
  const path = `/repos/${req.repo}/pulls/${String(req.pullNumber)}`;
  const pr = await github(fetchFn, "GET", path, reviewer.token);
  const what = `pull request #${String(req.pullNumber)} in ${req.repo}`;
  if (pr.state !== "open") throw new ReviewRefused(`${what} is ${String(pr.state)}, not open`);
  const head = String((pr.head as { sha?: unknown } | undefined)?.sha);
  if (head !== req.head) {
    throw new ReviewRefused(`the head of ${what} moved from ${req.head} to ${head} since it was read; read the new commits and review again`);
  }
  const author = String((pr.user as { login?: unknown } | null | undefined)?.login);
  if (author.toLowerCase() === reviewer.login.toLowerCase()) {
    throw new ReviewRefused(`${what} was opened by ${reviewer.login}, the reviewing account itself, and GitHub does not let an author approve or request changes on their own pull request`);
  }
  const posted = await github(fetchFn, "POST", `${path}/reviews`, reviewer.token, { commit_id: head, body: req.body, event: req.event });
  return { id: Number(posted.id), url: String(posted.html_url), commit: String(posted.commit_id), state: String(posted.state) };
}

/** What the CI review's judging step hands to its posting step: the `structured_output` of `claude -p --json-schema`. */
export interface Verdict {
  verdict: "approve" | "request_changes";
  body: string;
}

const HEADINGS: Record<Verdict["verdict"], string> = { approve: "**AI critic: passes**", request_changes: "**AI critic: requests changes**" };

/**
 * Check a verdict written by the judging step, which read untrusted input, and
 * turn it into a review event and body. Throws `ReviewRefused` unless it is
 * exactly `{ verdict, body }` with a known verdict and the body's first line
 * names the same verdict on `head`, as .claude/skills/review-pull-request/checks.md
 * asks, so a body that argues one way cannot be posted under the other.
 */
export function reviewFromVerdict(value: unknown, head: string): { event: ReviewEvent; body: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ReviewRefused("the verdict is not a JSON object");
  const extra = Object.keys(value).filter((k) => k !== "verdict" && k !== "body");
  if (extra.length > 0) throw new ReviewRefused(`the verdict has fields other than verdict and body: ${extra.join(", ")}`);
  const { verdict, body } = value as Record<string, unknown>;
  if (verdict !== "approve" && verdict !== "request_changes") throw new ReviewRefused(`'${String(verdict)}' is not a verdict; it is approve or request_changes`);
  if (typeof body !== "string") throw new ReviewRefused("the verdict's body is not a string");
  const first = body.trimStart().split("\n", 1)[0] ?? "";
  if (!first.startsWith(`${HEADINGS[verdict]} on ${head}`)) {
    throw new ReviewRefused(`the body's first line does not read '${HEADINGS[verdict]} on ${head}.', so it does not match the verdict ${verdict} on the head commit`);
  }
  return { event: verdict === "approve" ? "APPROVE" : "REQUEST_CHANGES", body };
}
