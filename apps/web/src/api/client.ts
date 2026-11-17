// HTTP calls to apps/api. Every body is parsed with the zod schemas in
// @workbench/shared, so a server that drifts from the contract fails loudly
// here instead of rendering half a board. Paths are relative: Vite proxies
// `/api` to the API in development.
import {
  aiTeammateProfileResponse,
  apiError,
  batchResponse,
  boardResponse,
  cardResponse,
  createCardResponse,
  criticGatesResponse,
  logFiltersResponse,
  teammateProfileResponse,
  teammateResponse,
  teamResponse,
  writeResponse,
  type AddTeammateRequest,
  type LeaveTeamRequest,
  type AiTeammateProfileResponse,
  type AnswerRequest,
  type AskRequest,
  type ApiErrorCode,
  type BatchResponse,
  type BoardResponse,
  type CardResponse,
  type CreateCardRequest,
  type CreateCardResponse,
  type CriticGatesResponse,
  type HandBatchRequest,
  type LogFiltersResponse,
  type LogName,
  type MoveStatusRequest,
  type PickRequest,
  type SetCriticGateRequest,
  type SetLogFilterRequest,
  type SetModeRequest,
  type SetRolesRequest,
  type TeammateResponse,
  type TeammateProfileResponse,
  type TeamResponse,
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

/**
 * Whether `GET /api/teammates/:id/profile` answers for a person or an AI
 * teammate, read before the board has loaded. Only `teammate.kind` is read;
 * the screen that is chosen parses the whole profile with the shared schema.
 */
export async function fetchProfileKind(teammateId: string, signal?: AbortSignal): Promise<"human" | "ai"> {
  const body = await getJson(`/teammates/${encodeURIComponent(teammateId)}/profile`, signal);
  const kind = (body as { teammate?: { kind?: unknown } } | undefined)?.teammate?.kind;
  if (kind !== "human" && kind !== "ai") throw new ApiRequestError("bad_response", "the profile from the API names no teammate kind");
  return kind;
}

function parseProfile(body: unknown): TeammateProfileResponse {
  const parsed = teammateProfileResponse.safeParse(body);
  if (!parsed.success) throw new ApiRequestError("bad_response", "the profile from the API does not match the shared schema");
  return parsed.data;
}

/** `GET /api/team`: every step from process/ and every person with their mode for each step of their chain. */
export async function fetchTeam(signal?: AbortSignal): Promise<TeamResponse> {
  const parsed = teamResponse.safeParse(await getJson("/team", signal));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the team from the API does not match the shared schema");
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

/**
 * `POST /api/cards`: a person puts a new card on the board in Backlog, under
 * the next number. Answers with the card; the board also hears its
 * `card_created` event over the stream.
 */
export async function createCard(request: CreateCardRequest): Promise<CreateCardResponse> {
  const parsed = createCardResponse.safeParse(await postJson("/cards", request));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the new card from the API does not match the shared schema");
  return parsed.data;
}

/**
 * `POST /api/cards/:id/questions`: a person asks a teammate a question on a
 * card in progress. The card moves to Needs input, waiting on `asked_of`.
 */
export async function askQuestion(cardId: string, request: AskRequest): Promise<WriteResponse> {
  return parseWrite(await postJson(`/cards/${encodeURIComponent(cardId)}/questions`, request), "the question");
}

/** `POST /api/cards/:id/questions/:questionId/answer`. A card waiting on the question goes back to In progress. */
export async function answerQuestion(cardId: string, questionId: string, request: AnswerRequest): Promise<WriteResponse> {
  const path = `/cards/${encodeURIComponent(cardId)}/questions/${encodeURIComponent(questionId)}/answer`;
  const parsed = writeResponse.safeParse(await postJson(path, request));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the answer from the API does not match the shared schema");
  return parsed.data;
}

/** `POST /api/cards/:id/status`: a person's status move, such as Backlog to Ready. `from` must be the card's current state. */
export async function moveCard(cardId: string, request: MoveStatusRequest): Promise<WriteResponse> {
  return parseWrite(await postJson(`/cards/${encodeURIComponent(cardId)}/status`, request), "the move");
}

/** `POST /api/cards/:id/pick`: move a Ready card to In progress in its owner's mode; `mode`, when given, must be that mode. */
export async function pickCard(cardId: string, request: PickRequest): Promise<WriteResponse> {
  return parseWrite(await postJson(`/cards/${encodeURIComponent(cardId)}/pick`, request), "the pick");
}

/**
 * `POST /api/batches`: a person hands two or more Ready cards to the AI as one
 * batch. Answers with the batch; the board also hears it over the event stream.
 */
export async function handBatch(request: HandBatchRequest): Promise<BatchResponse> {
  const parsed = batchResponse.safeParse(await postJson("/batches", request));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the batch from the API does not match the shared schema");
  return parsed.data;
}

function parseWrite(body: unknown, what: string): WriteResponse {
  const parsed = writeResponse.safeParse(body);
  if (!parsed.success) throw new ApiRequestError("bad_response", `the answer to ${what} does not match the shared schema`);
  return parsed.data;
}

/**
 * `POST /api/logs/:log/filter`: set the event types one log hides for the
 * whole team. Answers with every log's filter; the change also reaches every
 * board over the event stream.
 */
export async function setLogFilter(log: LogName, request: SetLogFilterRequest): Promise<LogFiltersResponse> {
  const parsed = logFiltersResponse.safeParse(await postJson(`/logs/${encodeURIComponent(log)}/filter`, request));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the log filters from the API do not match the shared schema");
  return parsed.data;
}

/**
 * `POST /api/functions/:id/critic-gate`: a person sets whether the AI critic
 * must pass before a person's approval moves a card of the function to done,
 * for the whole team. Answers with every gate someone has set; the change also
 * reaches every board over the event stream.
 */
export async function setCriticGate(functionId: string, request: SetCriticGateRequest): Promise<CriticGatesResponse> {
  const parsed = criticGatesResponse.safeParse(await postJson(`/functions/${encodeURIComponent(functionId)}/critic-gate`, request));
  if (!parsed.success) throw new ApiRequestError("bad_response", "the critic gates from the API do not match the shared schema");
  return parsed.data;
}

/**
 * `POST /api/teammates`: a person adds a person to the team with the roles
 * they join with. Answers with the person; the board and the team screen also
 * hear the joining `roles_changed` event over the stream.
 */
export async function addTeammate(request: AddTeammateRequest): Promise<TeammateResponse> {
  return parseTeammate(await postJson("/teammates", request));
}

/**
 * `POST /api/teammates/:id/roles`: a person sets the roles someone holds, first
 * role first. `was` is what the view showed, so a stale view is refused with 409.
 */
export async function setRoles(teammateId: string, request: SetRolesRequest): Promise<TeammateResponse> {
  return parseTeammate(await postJson(`/teammates/${encodeURIComponent(teammateId)}/roles`, request));
}

/**
 * `POST /api/teammates/:id/leave`: a person takes a person off the team.
 * Answers with the person as they stood when they left; the board and the
 * team screen also hear the `teammate_left` event over the stream.
 */
export async function leaveTeam(teammateId: string, request: LeaveTeamRequest): Promise<TeammateResponse> {
  return parseTeammate(await postJson(`/teammates/${encodeURIComponent(teammateId)}/leave`, request));
}

function parseTeammate(body: unknown): TeammateResponse {
  const parsed = teammateResponse.safeParse(body);
  if (!parsed.success) throw new ApiRequestError("bad_response", "the teammate from the API does not match the shared schema");
  return parsed.data;
}
