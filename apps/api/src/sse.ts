// The live event stream, `GET /api/events`. Each connection subscribes to the
// store's appends first and then replays what the client missed from the
// table, so an event appended during the replay is neither lost nor sent
// twice. The SSE `id` of each message is the event's position in the stream
// (`seq`), so a browser that reconnects sends `Last-Event-ID` and gets exactly
// the events after it.
import type { Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import type { Db } from "./db/client.ts";
import { eventsAfter, lastSeq, onAppend, type StoredEvent } from "./store.ts";

/** How often an idle stream sends an SSE comment, so proxies keep it open. */
const KEEPALIVE_MS = 25_000;

/**
 * Where a connection starts: after `Last-Event-ID` when the browser
 * reconnects, else after `?after=` (the board's `last_seq`), else at the end
 * of the stream. Returns undefined for a value that is not a position.
 */
export async function startingPoint(c: Context, db: Db): Promise<number | undefined> {
  const raw = c.req.header("Last-Event-ID") ?? c.req.query("after");
  if (raw === undefined) return lastSeq(db);
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

async function send(stream: SSEStreamingApi, stored: StoredEvent): Promise<void> {
  await stream.writeSSE({ id: String(stored.seq), data: JSON.stringify(stored.event) });
}

/**
 * Stream every event after position `start`, then every event appended
 * later, each once. `start` is fixed before the response is returned, so an
 * event appended after the client has the response is always delivered.
 */
export function eventStream(c: Context, db: Db, start: number): Response {
  return streamSSE(c, async (stream) => {
    let sent = start;
    const queue: StoredEvent[] = [];
    let wake: (() => void) | undefined;
    const stop = onAppend(db, (stored) => {
      queue.push(stored);
      wake?.();
    });
    stream.onAbort(() => {
      stop();
      wake?.();
    });
    try {
      for (const stored of await eventsAfter(db, sent)) {
        await send(stream, stored);
        sent = stored.seq;
      }
      while (!stream.aborted) {
        const next = queue.shift();
        if (next) {
          // Appends that landed during the replay are already sent.
          if (next.seq > sent) {
            await send(stream, next);
            sent = next.seq;
          }
          continue;
        }
        const woke = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), KEEPALIVE_MS);
          wake = () => {
            clearTimeout(timer);
            resolve(true);
          };
        });
        wake = undefined;
        if (!woke && !stream.aborted) await stream.write(": keepalive\n\n");
      }
    } finally {
      stop();
    }
  });
}
