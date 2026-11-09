// HTTP calls to apps/api. Every body is parsed with the zod schemas in
// @workbench/shared, so a server that drifts from the contract fails loudly
// here instead of rendering half a board. Paths are relative: Vite proxies
// `/api` to the API in development.
import {
  aiTeammateProfileResponse,
  apiError,
  boardResponse,
  cardResponse,
  teammateProfileResponse,
  writeResponse,
  type AiTeammateProfileResponse,
  type AnswerRequest,
  type ApiErrorCode,
  type BoardResponse,
  type CardResponse,
  type SetModeRequest,
  type TeammateProfileResponse,
  type WriteResponse,
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

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  return requestJson(path, { headers: { accept: "application/json" }, ...(signal ? { signal } : {}) });
}

async function postJson(path: string, payload: unknown): Promise<unknown> {
  return requestJson(path, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const signal = init.signal ?? undefined;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
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
  return parseProfile(await postJson(`/teammates/${encodeURIComponent(teammateId)}/modes`, request));
}

/**
 * `GET /api/teammates/:id/profile` for an AI teammate: the same route as a
 * person's profile, answered in the AI teammate's own shape.
 */
export async function fetchAiProfile(teammateId: string, signal?: AbortSignal): Promise<AiTeammateProfileResponse> {
  const parsed = aiTeammateProfileResponse.safeParse(await getJson(`/teammates/${encodeURIComponent(teammateId)}/profile`, signal));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the AI teammate's profile from the API does not match the shared schema");
  return parsed.data;
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

/** `GET /api/cards/:id`: the card, its whole log, its questions and its function from process/. */
export async function fetchCard(cardId: string, signal?: AbortSignal): Promise<CardResponse> {
  const parsed = cardResponse.safeParse(await getJson(`/cards/${encodeURIComponent(cardId)}`, signal));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the card from the API does not match the shared schema");
  return parsed.data;
}

/** `POST /api/cards/:id/questions/:questionId/answer`. A card waiting on the question goes back to In progress. */
export async function answerQuestion(cardId: string, questionId: string, request: AnswerRequest): Promise<WriteResponse> {
  const path = `/cards/${encodeURIComponent(cardId)}/questions/${encodeURIComponent(questionId)}/answer`;
  const parsed = writeResponse.safeParse(await postJson(path, request));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the answer from the API does not match the shared schema");
  return parsed.data;
}
