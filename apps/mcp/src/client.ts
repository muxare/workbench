// A thin HTTP client of the workbench API (apps/api). The MCP server goes
// through it for everything, so the API stays the one place where the rules
// are enforced; nothing here opens the database. Every answer is parsed with
// the shared schemas from @workbench/shared, so a change to the API that this
// client does not follow fails loudly instead of passing bad data on.
import {
  apiError,
  boardResponse,
  cardResponse,
  writeResponse,
  type AskRequest,
  type BoardResponse,
  type CardResponse,
  type PickRequest,
  type ReportRequest,
  type WriteResponse,
} from "@workbench/shared";
import type { z } from "zod";

/** The fetch the client calls; tests pass the Hono app's `request` instead of the network. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** A request the API refused, with its HTTP status, error code and reason. */
export class ApiRefusal extends Error {
  override name = "ApiRefusal";
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, reason: string) {
    super(reason);
    this.status = status;
    this.code = code;
  }
}

/** The API could not be reached at all, which is not a refusal. */
export class ApiUnreachable extends Error {
  override name = "ApiUnreachable";
}

export class WorkbenchClient {
  readonly baseUrl: string;
  private readonly fetchFn: Fetch;

  constructor(baseUrl: string, fetchFn: Fetch = (input, init) => fetch(input, init)) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn;
  }

  board(): Promise<BoardResponse> {
    return this.get("/api/board", boardResponse);
  }

  card(id: string): Promise<CardResponse> {
    return this.get(`/api/cards/${encodeURIComponent(id)}`, cardResponse);
  }

  pick(id: string, req: PickRequest): Promise<WriteResponse> {
    return this.post(`/api/cards/${encodeURIComponent(id)}/pick`, req, writeResponse);
  }

  ask(id: string, req: AskRequest): Promise<WriteResponse> {
    return this.post(`/api/cards/${encodeURIComponent(id)}/questions`, req, writeResponse);
  }

  report(id: string, req: ReportRequest): Promise<WriteResponse> {
    return this.post(`/api/cards/${encodeURIComponent(id)}/reports`, req, writeResponse);
  }

  /**
   * Open the live event stream at its current end (`GET /api/events` with no
   * starting point). The response is returned once its headers arrive, which
   * the API sends at once, so every event appended after this resolves is
   * delivered on the stream.
   */
  async events(signal: AbortSignal): Promise<Response> {
    const res = await this.send("/api/events", { headers: { Accept: "text/event-stream" }, signal });
    if (!res.ok) await this.refuse(res);
    if (!res.body) throw new ApiUnreachable("the event stream has no body");
    return res;
  }

  private async get<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
    return this.parse(await this.send(path, {}), schema);
  }

  private async post<S extends z.ZodType>(path: string, payload: unknown, schema: S): Promise<z.output<S>> {
    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
    return this.parse(await this.send(path, init), schema);
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch (err) {
      if (init.signal?.aborted) throw err;
      const why = err instanceof Error ? err.message : String(err);
      throw new ApiUnreachable(`the workbench API at ${this.baseUrl} did not answer (${why}); is team:serve running?`);
    }
  }

  private async parse<S extends z.ZodType>(res: Response, schema: S): Promise<z.output<S>> {
    if (!res.ok) await this.refuse(res);
    return schema.parse(await res.json());
  }

  private async refuse(res: Response): Promise<never> {
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    const parsed = apiError.safeParse(body);
    if (parsed.success) throw new ApiRefusal(res.status, parsed.data.error, parsed.data.reason);
    throw new ApiRefusal(res.status, "internal", text.trim() || `HTTP ${String(res.status)}`);
  }
}
