// The parts of GitHub's webhook payloads the board reads, checked with zod.
// The shapes follow GitHub's webhook reference
// (https://docs.github.com/en/webhooks/webhook-events-and-payloads) and the
// payload schemas GitHub publishes in octokit/webhooks; fields the board does
// not read are left out, and zod drops them when parsing.
import { z } from "zod";

const account = z.object({ login: z.string().min(1) });
const repository = z.object({ full_name: z.string().min(1), html_url: z.url() });

/** Every delivery but `ping` and `push` names an action; this is read first, so an action the board ignores is never parsed further. */
export const withAction = z.object({ action: z.string().optional() });

/** `push`: one push to a branch or a tag. There is no action. */
export const pushPayload = z.object({
  /** The full ref, `refs/heads/<branch>` or `refs/tags/<tag>`. */
  ref: z.string().min(1),
  after: z.string().min(1),
  created: z.boolean(),
  deleted: z.boolean(),
  forced: z.boolean(),
  compare: z.url(),
  commits: z.array(z.unknown()),
  repository,
  sender: account,
});
export type PushPayload = z.infer<typeof pushPayload>;

const pullRequest = z.object({
  number: z.int().positive(),
  html_url: z.url(),
  title: z.string().min(1),
  body: z.string().nullable(),
  draft: z.boolean().optional(),
  head: z.object({ ref: z.string().min(1) }),
});

/** `pull_request`: opened, ready_for_review and closed are read. A merge is `closed` with `merged: true`. */
export const pullRequestPayload = z.object({
  action: z.string(),
  pull_request: pullRequest.extend({
    merged: z.boolean().nullable().optional(),
    merged_by: account.nullable().optional(),
  }),
  sender: account,
});
export type PullRequestPayload = z.infer<typeof pullRequestPayload>;

/** `pull_request_review`: submitted is read; `review.state` is lower case in webhooks. */
export const pullRequestReviewPayload = z.object({
  action: z.string(),
  review: z.object({
    state: z.enum(["approved", "changes_requested", "commented", "dismissed"]),
    html_url: z.url(),
    body: z.string().nullable(),
    user: account.nullable(),
  }),
  pull_request: pullRequest.pick({ number: true, html_url: true, body: true, head: true }),
  sender: account,
});
export type PullRequestReviewPayload = z.infer<typeof pullRequestReviewPayload>;

/**
 * `workflow_run`: completed is read. `pull_requests` lists the open pull
 * requests whose head is the run's commit; it is empty for a run on `main`
 * and for a pull request from a fork.
 */
export const workflowRunPayload = z.object({
  action: z.string(),
  workflow_run: z.object({
    id: z.int().positive(),
    name: z.string().nullable(),
    run_number: z.int().positive(),
    event: z.string(),
    head_branch: z.string().nullable(),
    conclusion: z.enum(["success", "failure", "neutral", "cancelled", "timed_out", "action_required", "stale", "skipped"]).nullable(),
    html_url: z.url(),
    pull_requests: z.array(z.object({ number: z.int().positive(), head: z.object({ ref: z.string().min(1) }) })),
    actor: account,
    triggering_actor: account.nullable().optional(),
  }),
  sender: account,
});
export type WorkflowRunPayload = z.infer<typeof workflowRunPayload>;
