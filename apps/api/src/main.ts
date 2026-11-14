import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { defaultDatabaseUrl, fallbackDatabaseUrl, openDb } from "./db/client.ts";
import { parseGithubLogins } from "./github/logins.ts";
import { loadFunctionIds } from "./process.ts";
import { stubProvider } from "./teammates/stubProvider.ts";
import { startTeammateTimer, timerInterval } from "./teammates/timer.ts";

const databaseUrl = defaultDatabaseUrl();
if (databaseUrl === fallbackDatabaseUrl) mkdirSync("data", { recursive: true });
const db = await openDb(databaseUrl);
// Off by default: set TEAMMATE_INTERVAL_MS (at least 1000) to let the AI
// teammate TEAMMATE_ID (default invented-ai) take a step on its own.
const intervalMs = timerInterval(process.env.TEAMMATE_INTERVAL_MS);
const teammateId = process.env.TEAMMATE_ID ?? "invented-ai";
// GitHub webhooks (POST /api/github/webhook) need GITHUB_WEBHOOK_SECRET, the
// secret set on the webhook; without it the endpoint answers 503.
// GITHUB_LOGINS ("login=teammate,...") says which teammate each GitHub account
// is; team:serve fills it from the team file.
const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
// The teammate's profile says whether the timer runs it.
const app = createApp({
  db,
  functionIds: loadFunctionIds(),
  ...(intervalMs === undefined ? {} : { teammateTimer: { teammateId, intervalMs } }),
  ...(githubWebhookSecret ? { githubWebhookSecret } : {}),
  githubLogins: parseGithubLogins(process.env.GITHUB_LOGINS),
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => console.log(`api on http://localhost:${info.port}/api`));

if (intervalMs !== undefined) {
  startTeammateTimer(db, {
    teammateId,
    provider: stubProvider,
    intervalMs,
    onRun: (run) => console.log(`${teammateId} worked ${run.card.id}`),
  });
  console.log(`${teammateId} runs every ${String(intervalMs)} ms`);
}
