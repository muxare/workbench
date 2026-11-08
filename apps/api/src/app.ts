import { Hono } from "hono";
import { cardStatus } from "@workbench/shared";

// Routes live under /api so the web dev server can proxy one prefix.
export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, statuses: cardStatus.options }));

export type AppType = typeof app;
