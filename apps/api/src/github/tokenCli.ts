// `pnpm --silent --filter @workbench/api github:token muxare/workbench`: print an
// installation token for the workbench's GitHub App on the repository, for
// example to open a pull request as the App with `GH_TOKEN=$(...) gh pr create`.
// GITHUB_APP_ID is the App's id; GITHUB_APP_PRIVATE_KEY_PATH is its key file,
// kept outside the repository.
import { readFileSync } from "node:fs";
import { installationToken } from "./appToken.ts";

const repo = process.argv[2];
const appId = process.env.GITHUB_APP_ID;
const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
if (!repo || !appId || !keyPath) {
  console.error("usage: GITHUB_APP_ID=<id> GITHUB_APP_PRIVATE_KEY_PATH=<file> github:token <owner/repo>");
  process.exit(2);
}
const { token } = await installationToken(appId, readFileSync(keyPath, "utf8"), repo);
process.stdout.write(`${token}\n`);
