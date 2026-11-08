import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { defaultDatabaseUrl, openDb } from "./db/client.ts";
import { loadFunctionIds } from "./process.ts";

if (defaultDatabaseUrl === "file:data/workbench.db") mkdirSync("data", { recursive: true });
const app = createApp({ db: await openDb(defaultDatabaseUrl), functionIds: loadFunctionIds() });

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => console.log(`api on http://localhost:${info.port}/api`));
