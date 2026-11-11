// Waiting for a person's answer to a question on a card. The wait follows the
// API's live event stream (`GET /api/events`) rather than polling: it opens
// the stream first, then reads the card once, so an answer given before the
// stream opened is seen on the card and one given after arrives as an
// `answered` event. It never waits longer than it is told to; on a timeout
// it says so, and the session can call again.
import { streamEvent, type Question } from "@workbench/shared";
import { ApiRefusal, type WorkbenchClient } from "./client.ts";

export type WaitResult =
  | { answered: true; question: Question }
  | { answered: false; question: Question; reason: "timeout" | "stream_closed" };

export interface WaitOptions {
  timeoutMs: number;
  /** Cancels the wait, such as when the MCP client cancels the tool call. */
  signal?: AbortSignal;
}

async function question(client: WorkbenchClient, cardId: string, questionId: string): Promise<Question> {
  const q = (await client.card(cardId)).questions.find((x) => x.id === questionId);
  if (!q) throw new ApiRefusal(404, "not_found", `no question '${questionId}' on ${cardId}`);
  return q;
}

/** The `data` of each complete SSE message in `buffer`, and what is left over. */
export function takeMessages(buffer: string): { data: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  const data = parts
    .map((block) =>
      block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).replace(/^ /, ""))
        .join("\n"),
    )
    .filter((d) => d.length > 0);
  return { data, rest };
}

/** Wait until question `questionId` on `cardId` is answered, or `timeoutMs` passes. */
export async function waitForAnswer(client: WorkbenchClient, cardId: string, questionId: string, options: WaitOptions): Promise<WaitResult> {
  const stop = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timedOut = false;
  // Aborting the request ends a stream from the network; cancelling the
  // reader ends one that is already being read, wherever it comes from.
  const end = () => {
    stop.abort();
    void reader?.cancel().catch(() => undefined);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    end();
  }, options.timeoutMs);
  options.signal?.addEventListener("abort", end, { once: true });
  try {
    const res = await client.events(stop.signal);
    reader = res.body?.getReader();
    // A wait that ended while the stream was opening reads nothing more from it.
    if (stop.signal.aborted) void reader?.cancel().catch(() => undefined);
    // The stream is open, so anything answered from here on arrives on it.
    const before = await question(client, cardId, questionId);
    if (before.answer !== undefined) return { answered: true, question: before };
    if (!reader) return { answered: false, question: before, reason: "stream_closed" };

    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const { data, rest } = takeMessages(buffer);
      buffer = rest;
      for (const d of data) {
        const event = streamEvent.safeParse(JSON.parse(d));
        if (event.success && event.data.type === "answered" && event.data.card_id === cardId && event.data.question_id === questionId) {
          return { answered: true, question: await question(client, cardId, questionId) };
        }
      }
    }
    options.signal?.throwIfAborted();
    // The wait timed out or the API closed the stream; read the card once more before giving up.
    const after = await question(client, cardId, questionId);
    if (after.answer !== undefined) return { answered: true, question: after };
    return { answered: false, question: after, reason: timedOut ? "timeout" : "stream_closed" };
  } catch (err) {
    if (timedOut && !options.signal?.aborted) {
      const q = await question(client, cardId, questionId);
      return q.answer !== undefined ? { answered: true, question: q } : { answered: false, question: q, reason: "timeout" };
    }
    throw err;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", end);
    // Closing the reader ends the API's side of the stream too.
    await reader?.cancel().catch(() => undefined);
    stop.abort();
  }
}
