import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { defaultDatabaseUrl, openDb } from "./db/client.ts";
import { loadFunctionIds } from "./process.ts";
import { stubProvider } from "./teammates/stubProvider.ts";
import { startTeammateTimer, timerInterval } from "./teammates/timer.ts";

if (defaultDatabaseUrl === "file:data/workbench.db") mkdirSync("data", { recursive: true });
const db = await openDb(defaultDatabaseUrl);
// Off by default: set TEAMMATE_INTERVAL_MS (at least 1000) to let the AI
// teammate TEAMMATE_ID (default invented-ai) take a step on its own.
const intervalMs = timerInterval(process.env.TEAMMATE_INTERVAL_MS);
const teammateId = process.env.TEAMMATE_ID ?? "invented-ai";
// The teammate's profile says whether the timer runs it.
const app = createApp({
  db,
  functionIds: loadFunctionIds(),
  ...(intervalMs === undefined ? {} : { teammateTimer: { teammateId, intervalMs } }),
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
