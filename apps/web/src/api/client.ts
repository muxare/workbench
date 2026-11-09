// HTTP calls to apps/api. Every body is parsed with the zod schemas in
// @workbench/shared, so a server that drifts from the contract fails loudly
// here instead of rendering half a board. Paths are relative: Vite proxies
// `/api` to the API in development.
import {
  apiError,
  boardResponse,
  teammateProfileResponse,
  type ApiErrorCode,
  type BoardResponse,
  type SetModeRequest,
  type TeammateProfileResponse,
} from "@workbench/shared";

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

/** POST a JSON body; failures are reported as in `getJson`. */
async function sendJson(path: string, payload: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
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

/** `GET /api/teammates/:id/profile`: a person and their chain of steps, read from process/. */
export async function fetchProfile(teammateId: string, signal?: AbortSignal): Promise<TeammateProfileResponse> {
  return parseProfile(await getJson(`/teammates/${encodeURIComponent(teammateId)}/profile`, signal));
}

/** `POST /api/teammates/:id/modes`: the person sets the mode for one step; answers with the new profile. */
export async function setMode(teammateId: string, request: SetModeRequest): Promise<TeammateProfileResponse> {
  return parseProfile(await sendJson(`/teammates/${encodeURIComponent(teammateId)}/modes`, request));
}

function parseProfile(body: unknown): TeammateProfileResponse {
  const parsed = teammateProfileResponse.safeParse(body);
  if (!parsed.success) throw new ApiRequestError("bad_response", "the profile from the API does not match the shared schema");
  return parsed.data;
}

/** `GET /api/board`: the cards, teammates, open questions, recent log and stream position. */
export async function fetchBoard(signal?: AbortSignal): Promise<BoardResponse> {
  const parsed = boardResponse.safeParse(await getJson("/board", signal));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the board from the API does not match the shared schema");
  return parsed.data;
}
