# Tutorial: pnpm, Hono and server-sent events

Written 2026-11-08 so Mikael can try the three proposed parts of the stack before deciding on them (question 4 in `docs/next.md`). It takes about an hour. Everything happens in a throwaway folder outside this repo, so nothing here pre-empts the real scaffold. Claude ran section 4 and exercises 2 to 4 on 2026-11-08 with Node 25.8, pnpm 11.28, Hono 4.13 and `@hono/node-server` 2.1; the outputs shown are from that run.

The tutorial explains each tool in terms of what the workbench needs from it, then builds a tiny board server that pushes card events to a browser. That server is the first slice of `docs/architecture.md` in miniature: an append-only event list, a request that moves a card, and a live stream that everyone watching receives.

## 1. pnpm: the package manager

### Why it is proposed

The app is one repository with three packages: `apps/web`, `apps/api` and `packages/shared`. The web app and the API both import the shared zod schemas, and they must import the same copy, not a published version that has drifted. A package manager with workspaces solves this by linking local packages into each other. npm and Yarn can do that too; pnpm is proposed because it does it with less friction and with two properties that matter when AI writes much of the code.

The first is strictness. npm flattens every dependency into one `node_modules` folder, so code can import a package it never declared, because something else happened to pull it in. That works until the other package is upgraded or removed. pnpm only exposes what a package lists in its own `package.json`, so an undeclared import fails at once, on the machine that wrote it. AI-written code is prone to exactly this mistake.

The second is that pnpm keeps one content-addressed store on disk and hard-links packages from it. Installs are fast and a second project costs almost no disk space.

### Install it

Check your Node version first with `node --version`. The app targets a current LTS release (22 or 24). Then install pnpm globally:

```sh
npm install -g pnpm
pnpm --version
```

Corepack, which used to ship with Node and could activate pnpm without a global install, is no longer bundled from Node 25, so the global install is the simplest route. The real repo will pin the version in the root `package.json` (`pnpm init` in pnpm 11 writes a `devEngines.packageManager` entry for this), so everyone and every agent runs the same pnpm.

### The commands you will use

Most commands mirror npm. The ones worth knowing:

| Command | What it does |
| --- | --- |
| `pnpm install` | Installs everything for the whole workspace and writes `pnpm-lock.yaml`. |
| `pnpm add zod` | Adds a dependency to the package in the current folder. |
| `pnpm add -D typescript` | Adds a development dependency. |
| `pnpm <script>` | Runs a script from `package.json`; `run` is optional. |
| `pnpm exec <bin>` | Runs a binary installed in the package, like `npx` but without downloading. |
| `pnpm --filter @workbench/api dev` | Runs `dev` in one workspace package only. |
| `pnpm -r typecheck` | Runs `typecheck` in every package that has it (`-r` is recursive). |
| `pnpm approve-builds` | Lets chosen dependencies run their install scripts (see below). |

Dependencies may not run install scripts unless you approve them. This blocks a common supply-chain attack. In pnpm 11 an unapproved script makes `pnpm add` and `pnpm install` stop with `ERR_PNPM_IGNORED_BUILDS`, naming the package. Run `pnpm approve-builds <name>` and the approval is saved under `allowBuilds` in `pnpm-workspace.yaml`, so it is reviewed in git like any other change. You will meet this in section 4 with `esbuild`, which `tsx` uses, and later with `better-sqlite3`, which the event store will use.

### What a workspace looks like

You will not build this today; it is here so the real scaffold is familiar when it lands. A file at the repo root lists where the packages are:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

Each package has its own `package.json` with a name. The API depends on the shared package through the `workspace:` protocol, which tells pnpm to link the local folder instead of downloading anything:

```json
{
  "name": "@workbench/api",
  "dependencies": {
    "@workbench/shared": "workspace:*",
    "hono": "^4"
  }
}
```

A change to a schema in `packages/shared` is then visible in the API and the web app immediately, and the type checker catches every place that no longer fits.

## 2. Hono: the API framework

### Why it is proposed

The API is small: list the board, pick a card, ask a question, answer it, move a status, and stream events. It needs routing, JSON in and out, validation with zod, and server-sent events. Hono covers all of that in one small package with no further dependencies. It is written in TypeScript and infers types through the routes, so the web app can call the API with a typed client generated from the server code instead of a copied list of URLs and shapes. Express would work but is untyped and needs add-ons for most of this; Fastify is strong but larger than the job.

Hono is built on the web-standard `Request` and `Response`, so the same code runs on Node, Bun, Deno or a serverless platform. For now it runs on Node through the `@hono/node-server` adapter.

### The shape of a Hono app

A handler receives a context, usually called `c`, and returns a response:

```ts
import { Hono } from "hono";

const app = new Hono();

app.get("/cards/:id", (c) => {
  const id = c.req.param("id");      // path parameter
  const full = c.req.query("full");  // ?full=1
  return c.json({ id, full });       // JSON response with the right header
});
```

Validation plugs in as middleware. With `@hono/zod-validator`, the body is checked against a schema before the handler runs, an invalid body gets a 400 automatically, and inside the handler the parsed value is fully typed:

```ts
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const MoveCard = z.object({ status: z.enum(["ready", "in_progress", "needs_input", "review", "done"]) });

app.post("/cards/:id/move", zValidator("json", MoveCard), (c) => {
  const { status } = c.req.valid("json"); // typed as the enum above
  return c.json({ id: c.req.param("id"), status }, 201);
});
```

In the real app `MoveCard` lives in `packages/shared`, so the web app validates its form with the same schema the API enforces.

## 3. Server-sent events: live updates

### Why they are proposed

The board must update when someone else, or the AI teammate, picks a card, asks a question or moves a status. There are three common ways to do that. Polling asks the server every few seconds; it is simple but laggy and wasteful. WebSockets open a two-way channel; they are powerful but need their own protocol, reconnection logic and often a library. Server-sent events (SSE) are a one-way stream from server to browser over an ordinary HTTP response.

One way is enough here. The board only needs to receive events; every action a person takes is a normal POST, which is easier to validate, log and test than a message on a socket. SSE also fits the event store well: each event has an id, and when a browser reconnects it tells the server the last id it saw, so the server can replay what was missed. The workbench stores an append-only event stream anyway, so replay is a query, not extra machinery.

### The wire format

An SSE response has the content type `text/event-stream` and stays open. The server writes blocks of text separated by a blank line:

```
event: status_changed
data: {"card":"C-7","status":"needs_input"}
id: 42

```

The order of the lines does not matter. `data` carries the payload, usually JSON. `event` names the kind of event; leave it out and the browser treats it as a plain `message`. `id` is what the browser sends back as the `Last-Event-ID` header when it reconnects.

### The browser side

The browser has `EventSource` built in, with automatic reconnection:

```js
const events = new EventSource("/api/events");
events.addEventListener("status_changed", (message) => {
  const event = JSON.parse(message.data);
  // update the card on the board
});
```

Named events need `addEventListener` with that name; `onmessage` only receives events sent without an `event` field. That catches most people once.

### Limits to know

`EventSource` can only send GET requests and cannot set custom headers, so authentication rides on a cookie. Over HTTP/1.1 a browser allows about six open connections per host, and each SSE stream holds one, so many open tabs of the board can starve each other; HTTP/2 lifts this, and in development it rarely matters. Some proxies buffer responses and break streaming, which is something to check at deploy time, not now.

## 4. Build it: a live board in one file

Create a playground outside the repo and add the packages:

```sh
mkdir -p ~/scratch/sse-playground && cd ~/scratch/sse-playground
pnpm init
pnpm pkg set type=module
pnpm add hono @hono/node-server
pnpm add -D tsx typescript @types/node
pnpm approve-builds esbuild
```

The `-D` line stops with `ERR_PNPM_IGNORED_BUILDS` for `esbuild`; that is the install-script guard from section 1, and the `approve-builds` line clears it. `tsx` runs TypeScript directly, without a build step, which is what the API's dev script will use too.

Create `server.ts`:

```ts
import { EventEmitter } from "node:events";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";

// Invented example data. The real app stores events in SQLite.
type BoardEvent = { seq: number; type: "status_changed"; card: string; status: string; at: string };

const log: BoardEvent[] = []; // append-only: the single source of truth
const bus = new EventEmitter(); // tells open streams that something was appended

function append(e: Pick<BoardEvent, "type" | "card" | "status">): BoardEvent {
  const event = { ...e, seq: log.length + 1, at: new Date().toISOString() };
  log.push(event);
  bus.emit("event", event);
  return event;
}

const app = new Hono();

// An action is an ordinary request. It appends an event and returns it.
app.post("/cards/:id/move", async (c) => {
  const { status } = await c.req.json<{ status: string }>();
  return c.json(append({ type: "status_changed", card: c.req.param("id"), status }), 201);
});

// The board log is just a query over the events.
app.get("/log", (c) => c.json(log));

// The live stream: replay what the client missed, then push new events.
app.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    const send = (e: BoardEvent) =>
      stream.writeSSE({ id: String(e.seq), event: e.type, data: JSON.stringify(e) });

    const lastSeen = Number(c.req.header("Last-Event-ID") ?? 0);
    for (const e of log.filter((e) => e.seq > lastSeen)) await send(e);

    bus.on("event", send);
    // Keep the stream open until the client goes away, then clean up.
    await new Promise<void>((resolve) =>
      stream.onAbort(() => {
        bus.off("event", send);
        resolve();
      }),
    );
  }),
);

// A page to watch the stream in a browser.
app.get("/", (c) =>
  c.html(`<!doctype html>
<meta charset="utf-8">
<title>Board stream</title>
<h1>Board stream</h1>
<ul id="log"></ul>
<script>
  const events = new EventSource("/events");
  events.addEventListener("status_changed", (m) => {
    const e = JSON.parse(m.data);
    const li = document.createElement("li");
    li.textContent = "#" + e.seq + " " + e.card + " -> " + e.status;
    document.getElementById("log").append(li);
  });
  events.onerror = () => console.log("stream dropped, the browser will reconnect");
</script>`),
);

serve({ fetch: app.fetch, port: 3000 }, (info) => console.log(`http://localhost:${info.port}`));
```

Start it with reload on save:

```sh
pnpm exec tsx watch server.ts
```

## 5. Things to try

Each exercise shows one property the workbench relies on.

1. **See it live.** Open http://localhost:3000 in two browser windows. In a terminal, move a card:

   ```sh
   curl -X POST localhost:3000/cards/C-7/move -H 'content-type: application/json' -d '{"status":"needs_input"}'
   ```

   Both windows show the event at once. That is the board updating for the whole team when the AI teammate raises a question.

2. **Read the raw stream.** Run `curl -N localhost:3000/events` and move another card. You see the `id:`, `event:` and `data:` lines exactly as described in section 3. `-N` turns off curl's buffering.

3. **Replay after a gap.** Run `curl -N localhost:3000/events -H 'Last-Event-ID: 1'`. You get every event after the first, then the live stream. A browser does this on its own when its connection drops and comes back.

4. **Lose the state.** Stop the server with Ctrl-C and start it again. The windows reconnect, but `/log` is empty, because the events lived in memory. This is why the real event store is SQLite: the stream is only as durable as what it replays from.

5. **Break it on purpose.** Change the page to use `events.onmessage = ...` instead of `addEventListener("status_changed", ...)`. Nothing arrives, because the events are named. Change it back.

6. **Find the gap.** While the server replays old events in `/events`, it has not yet subscribed to new ones, so an event appended during the replay would be missed. With an in-memory array the window is tiny; with a database query it is real. Think about how to close it: subscribe first and buffer, or replay by `seq` after subscribing. The real API has to get this right.

7. **Add validation.** Run `pnpm add zod @hono/zod-validator` and replace the hand-parsed body in `/cards/:id/move` with the `zValidator` version from section 2. Post `{"status":"banana"}` and watch it get a 400 before your handler runs.

## 6. How this maps to the real app

The playground has every piece of the first slice except storage and the AI teammate. In the scaffold the pieces move apart: the event type and the request schemas go into `packages/shared`, the routes and the stream into `apps/api`, the `EventSource` into a hook in `apps/web`, and the array into an SQLite table through Drizzle. The Vite dev server proxies `/api` to the Hono server, so the browser sees one origin and needs no CORS setup. The web app calls actions through Hono's typed client, so renaming a field in a shared schema shows up as type errors in both apps before anything runs.

If anything in this tutorial makes one of the three choices look wrong for the workbench, that is the answer to question 4.

## Further reading

- pnpm workspaces: https://pnpm.io/workspaces
- Hono on Node: https://hono.dev/docs/getting-started/nodejs
- Hono streaming helpers, including `streamSSE`: https://hono.dev/docs/helpers/streaming
- Server-sent events on MDN: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
