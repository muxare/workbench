// Post the AI teammate's review of a pull request (review.ts):
//
//   pnpm --silent --filter @workbench/api github:review muxare/workbench 12 --head <sha> --approve --body-file review.md
//   pnpm --silent --filter @workbench/api github:review muxare/workbench 12 --head <sha> --verdict-file verdict.json --github-actions
//
// `--approve` passes the AI critic, `--request-changes` fails it, with the
// body from `--body-file`; or `--verdict-file` names the JSON verdict the
// `ai-review` workflow's judging step wrote (`{ "verdict", "body" }`), which
// is checked before anything is posted. `--head` is the full sha of the commit
// the review was written against, and nothing is posted when the pull
// request's head is no longer that commit.
//
// By default the review is posted as the workbench's GitHub App, with
// GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH as for `github:token`. With
// `--github-actions` it is posted with the token in GITHUB_TOKEN, as
// github-actions[bot], which is how the workflow posts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { GITHUB_ACTIONS_LOGIN, postReview, postReviewAs, reviewFromVerdict, ReviewRefused, type PostedReview, type ReviewEvent } from "./review.ts";

const USAGE = [
  "usage: github:review <owner/repo> <pr> --head <sha> ((--approve | --request-changes) --body-file <path> | --verdict-file <path>) [--github-actions]",
  "  as the App: GITHUB_APP_ID=<id> GITHUB_APP_PRIVATE_KEY_PATH=<file>; with --github-actions: GITHUB_TOKEN=<token>",
].join("\n");

function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        approve: { type: "boolean", default: false },
        "request-changes": { type: "boolean", default: false },
        head: { type: "string" },
        "body-file": { type: "string" },
        "verdict-file": { type: "string" },
        "github-actions": { type: "boolean", default: false },
      },
    });
  } catch (err) {
    return fail(`${(err as Error).message}\n${USAGE}`, 2);
  }
})();

const [repo, pr] = positionals;
const head = values.head;
const bodyFile = values["body-file"];
const verdictFile = values["verdict-file"];
const byFlag = values.approve !== values["request-changes"] && bodyFile !== undefined && verdictFile === undefined;
const byVerdict = verdictFile !== undefined && !values.approve && !values["request-changes"] && bodyFile === undefined;
if (!repo || !pr || positionals.length !== 2 || !head || (!byFlag && !byVerdict)) fail(USAGE, 2);

// pnpm runs the script in apps/api; a relative path is the caller's, from where pnpm was started.
const read = (path: string) => readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), path), "utf8");

function review(): { event: ReviewEvent; body: string } {
  if (verdictFile === undefined) return { event: values.approve ? "APPROVE" : "REQUEST_CHANGES", body: read(bodyFile!) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(read(verdictFile));
  } catch (err) {
    throw new ReviewRefused(`the verdict file is not JSON: ${(err as Error).message}`);
  }
  return reviewFromVerdict(parsed, head!);
}

try {
  const request = { repo, pullNumber: Number(pr), head, ...review() };
  let posted: PostedReview;
  if (values["github-actions"]) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) fail(`GITHUB_TOKEN is not set\n${USAGE}`, 2);
    posted = await postReviewAs({ token, login: GITHUB_ACTIONS_LOGIN }, request);
  } else {
    const appId = process.env.GITHUB_APP_ID;
    const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    if (!appId || !keyPath) fail(`GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH must be set\n${USAGE}`, 2);
    posted = await postReview({ appId, privateKeyPem: readFileSync(keyPath, "utf8") }, request);
  }
  process.stdout.write(`${posted.state} on ${posted.commit}: ${posted.url}\n`);
} catch (err) {
  fail(err instanceof ReviewRefused ? `refused: ${err.message}` : (err as Error).message, 1);
}
