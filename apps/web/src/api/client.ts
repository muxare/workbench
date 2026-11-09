// HTTP calls to apps/api. Every body is parsed with the zod schemas in
// @workbench/shared, so a server that drifts from the contract fails loudly
// here instead of rendering half a board. Paths are relative: Vite proxies
// `/api` to the API in development.
import { apiError, boardResponse, type ApiErrorCode, type BoardResponse } from "@workbench/shared";

/** Where the web app reaches the API. */
export const API_BASE = "/api";

/** The live event stream, starting after stream position `after`. */
export function eventsUrl(after: number): string {
  return `${API_BASE}/events?after=${after}`;
}

/**
 * Why a request failed. The `ApiErrorCode`s come from the API's 4xx bodies;
 * `server_error` is any other non-2xx answer, `network` is no answer at all,
 * and `bad_response` is a 2xx body that does not match the shared schema.
 */
export type RequestErrorCode = ApiErrorCode | "server_error" | "network" | "bad_response";

export class ApiRequestError extends Error {
  readonly code: RequestErrorCode;
  readonly reason: string;
  readonly status: number | undefined;
  constructor(code: RequestErrorCode, reason: string, status?: number) {
    super(reason);
    this.name = "ApiRequestError";
    this.code = code;
    this.reason = reason;
    this.status = status;
  }
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { accept: "application/json" }, ...(signal ? { signal } : {}) });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiRequestError("network", "the API cannot be reached");
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const problem = apiError.safeParse(body);
    if (problem.success) throw new ApiRequestError(problem.data.error, problem.data.reason, res.status);
    throw new ApiRequestError("server_error", `the API answered ${res.status}`, res.status);
  }
  return body;
}

/** `GET /api/board`: the cards, teammates, open questions, recent log and stream position. */
export async function fetchBoard(signal?: AbortSignal): Promise<BoardResponse> {
  const parsed = boardResponse.safeParse(await getJson("/board", signal));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the board from the API does not match the shared schema");
  return parsed.data;
}
