// `pnpm --silent --filter @workbench/api github:review muxare/workbench 12 --approve --head <sha> --body-file review.md`:
// post the AI teammate's review of a pull request as the workbench's GitHub
// App (review.ts). `--approve` passes the AI critic, `--request-changes` fails
// it; `--head` is the full sha of the commit the review was written against,
// and nothing is posted when the pull request's head is no longer that commit.
// GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH are as for `github:token`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { postReview, ReviewRefused, type ReviewEvent } from "./review.ts";

const USAGE =
  "usage: GITHUB_APP_ID=<id> GITHUB_APP_PRIVATE_KEY_PATH=<file> github:review <owner/repo> <pr> (--approve | --request-changes) --head <sha> --body-file <path>";

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
      },
    });
  } catch (err) {
    return fail(`${(err as Error).message}\n${USAGE}`, 2);
  }
})();

const [repo, pr] = positionals;
const appId = process.env.GITHUB_APP_ID;
const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
const bodyFile = values["body-file"];
if (!repo || !pr || positionals.length !== 2 || !values.head || !bodyFile || !appId || !keyPath || values.approve === values["request-changes"]) {
  fail(USAGE, 2);
}
const event: ReviewEvent = values.approve ? "APPROVE" : "REQUEST_CHANGES";
// pnpm runs the script in apps/api; a relative path is the caller's, from where pnpm was started.
const body = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), bodyFile), "utf8");

try {
  const review = await postReview(
    { appId, privateKeyPem: readFileSync(keyPath, "utf8") },
    { repo, pullNumber: Number(pr), event, body, head: values.head },
  );
  process.stdout.write(`${review.state} on ${review.commit}: ${review.url}\n`);
} catch (err) {
  fail(err instanceof ReviewRefused ? `refused: ${err.message}` : (err as Error).message, 1);
}
