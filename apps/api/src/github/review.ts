// The AI teammate's review of a pull request, posted as the workbench's GitHub
// App so that it is the AI's and not Mikael's (docs/dev-loop.md, "The three
// checks on this repository"). The review's content is written elsewhere, by a
// Claude Code session following .claude/skills/review-pull-request; this only
// posts it.
//
// The review is pinned to the commit the session read: it is posted with that
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

export interface PostedReview {
  id: number;
  url: string;
  commit: string;
  state: string;
}

/** A review the App must not post; nothing was sent to GitHub's review endpoint. */
export class ReviewRefused extends Error {
  override name = "ReviewRefused";
}

const SHA = /^[0-9a-f]{40}$/;

/** Throws `ReviewRefused` for a request that cannot be a review; checked before anything reaches GitHub. */
export function validateReviewRequest(req: ReviewRequest): void {
  if (!/^[^/\s]+\/[^/\s]+$/.test(req.repo)) throw new ReviewRefused(`'${req.repo}' is not owner/name`);
  if (!Number.isInteger(req.pullNumber) || req.pullNumber < 1) throw new ReviewRefused(`'${String(req.pullNumber)}' is not a pull request number`);
  if (!SHA.test(req.head)) throw new ReviewRefused(`'${req.head}' is not a full 40-character commit sha`);
  if (req.body.trim().length === 0) throw new ReviewRefused("the review body is empty; a verdict without findings or reasons says nothing");
}

/**
 * Post the review as the App: mint an installation token, read the pull
 * request, refuse unless it is open, its head is still `req.head`, and it
 * was not opened by the App itself (GitHub does not let an author approve or
 * request changes on their own pull request), then post the review on that
 * commit.
 */
export async function postReview(creds: AppCredentials, req: ReviewRequest, fetchFn: Fetch = fetch): Promise<PostedReview> {
  validateReviewRequest(req);
  const login = await appLogin(creds.appId, creds.privateKeyPem, fetchFn);
  const { token } = await installationToken(creds.appId, creds.privateKeyPem, req.repo, fetchFn);
  const path = `/repos/${req.repo}/pulls/${String(req.pullNumber)}`;
  const pr = await github(fetchFn, "GET", path, token);
  const what = `pull request #${String(req.pullNumber)} in ${req.repo}`;
  if (pr.state !== "open") throw new ReviewRefused(`${what} is ${String(pr.state)}, not open`);
  const head = String((pr.head as { sha?: unknown } | undefined)?.sha);
  if (head !== req.head) {
    throw new ReviewRefused(`the head of ${what} moved from ${req.head} to ${head} since it was read; read the new commits and review again`);
  }
  const author = String((pr.user as { login?: unknown } | null | undefined)?.login);
  if (author.toLowerCase() === login.toLowerCase()) {
    throw new ReviewRefused(`${what} was opened by ${login}, the App itself, and GitHub does not let an author approve or request changes on their own pull request`);
  }
  const posted = await github(fetchFn, "POST", `${path}/reviews`, token, { commit_id: head, body: req.body, event: req.event });
  return { id: Number(posted.id), url: String(posted.html_url), commit: String(posted.commit_id), state: String(posted.state) };
}
