// The HTTP API over the event store. Every write is a POST that appends events
// through `appendEvents`, which checks them against the stream; the board,
// card and question views are queries over the same stream, and
// `GET /api/events` streams each appended event to every connected client.
// `POST /api/teammates/:id/run` runs one step of an AI teammate through the
// same store, so its events reach the stream like any other write.
// `POST /api/teammates/:id/modes` appends a `mode_changed` event about the
// person, and a person's process profile is derived from those events, so a
// mode change reaches the logs and the stream like a card change.
// `POST /api/teammates/:id/roles` appends a `roles_changed` event in the same
// way; a person's roles are derived from those events.
// `POST /api/logs/:log/filter` appends a `log_filter_changed` event about the
// team, and each log's filter is derived from those events; the API never
// applies a filter to what it returns, because a filter is a view setting.
// `GET /api/teammates/:id/profile` reads the person's chain of steps from
// process/functions on each request; for an AI teammate it answers a
// separate, derived profile (aiProfile.ts).
// `GET /api/board` also carries the current cycle (`currentCycle` at the
// server's clock) and its cycle log, for the panel under the board, and each
// function's name, role and default mode from process/functions, so a panel
// counts modes over the same chain as the profile.
// `POST /api/github/webhook` takes GitHub's webhooks, checks their signature
// against GITHUB_WEBHOOK_SECRET, and records the card events they map to
// (github/webhook.ts).
// Request and response shapes live in @workbench/shared (api.ts).
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  answerRequest,
  askRequest,
  cardEvent,
  cardStatus,
  createCardRequest,
  currentCycle,
  isManualMove,
  logName,
  normalizeEventTypes,
  ownerMode,
  moveStatusRequest,
  pickRequest,
  sameEventTypes,
  sameRoles,
  setLogFilterRequest,
  setModeRequest,
  setRolesRequest,
  unfinishedDependencies,
  type HumanTeammate,
  type TeammateResponse,
  type TeammateProfileResponse,
  type AiTeammateProfileResponse,
  type ApiError,
  type ApiErrorCode,
  type BoardCycle,
  type BoardResponse,
  type Card,
  type CardEvent,
  type CardResponse,
  type FunctionFrontMatter,
  type LogFiltersResponse,
  type Teammate,
  type TeammateRunResponse,
  type WebhookResponse,
  type WriteResponse,
} from "@workbench/shared";
import type { Db } from "./db/client.ts";
import { loadFunctionDefinitions } from "./process.ts";
import { buildAiProfile } from "./aiProfile.ts";
import { buildProfile } from "./profile.ts";
import { eventStream, startingPoint } from "./sse.ts";
import { validSignature } from "./github/signature.ts";
import { handleDelivery, WebhookPayloadError } from "./github/webhook.ts";
import {
  addNumberedCard,
  appendEvents,
  boardLog,
  cardLog,
  cycleLog,
  getCard,
  getTeammate,
  lastSeq,
  listCards,
  listCycles,
  listQuestions,
  listTeammates,
  logFilters,
  StoreError,
  type StoreErrorCode,
} from "./store.ts";
import type { TeammateProvider } from "./teammates/provider.ts";
import { runTeammate } from "./teammates/runner.ts";
import { stubProvider } from "./teammates/stubProvider.ts";

export interface AppDeps {
  db: Db;
  /** Function names read from process/functions (`loadFunctionIds`). */
  functionIds: ReadonlySet<string>;
  /** The clock for event times; tests pass a fixed one. */
  now?: () => Date;
  /** New question and event ids. A new card takes the next number instead (see `addNumberedCard`). */
  newId?: () => string;
  /** What does the AI teammates' work. Defaults to the deterministic stub. */
  teammateProvider?: TeammateProvider;
  /**
   * Function definitions for the AI teammate and card detail. Defaults to
   * process/functions, read on each run and each card request.
   */
  definitions?: ReadonlyMap<string, FunctionFrontMatter>;
  /** The optional timer (TEAMMATE_INTERVAL_MS) and the AI teammate it runs, for that teammate's profile. */
  teammateTimer?: { teammateId: string; intervalMs: number };
  /** The secret GitHub signs webhooks with (GITHUB_WEBHOOK_SECRET); without it the webhook endpoint answers 503. */
  githubWebhookSecret?: string;
  /** GitHub login (lower case) to teammate id (GITHUB_LOGINS); a webhook from an unmapped account records nothing. */
  githubLogins?: ReadonlyMap<string, string>;
}

/** How many of the latest events `GET /board` returns as its log. */
const BOARD_LOG_LIMIT = 50;

const httpStatus = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rule_violation: 422,
  unavailable: 503,
} as const satisfies Record<ApiErrorCode, number>;

const fromStoreCode: Record<StoreErrorCode, ApiErrorCode> = {
  conflict: "conflict",
  forbidden: "forbidden",
  not_found: "not_found",
  unknown_function: "rule_violation",
  rule_violation: "rule_violation",
};

/** A request the API refuses, answered as an `ApiError` body. */
class ApiProblem extends Error {
  readonly code: ApiErrorCode;
  readonly issues: ApiError["issues"];
  constructor(code: ApiErrorCode, reason: string, issues?: ApiError["issues"]) {
    super(reason);
    this.code = code;
    this.issues = issues;
  }
}

function issuesOf(error: z.ZodError): NonNullable<ApiError["issues"]> {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiProblem("invalid_request", "the request body is not JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = issuesOf(parsed.error);
    const reason = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
    throw new ApiProblem("invalid_request", reason, issues);
  }
  return parsed.data;
}

export function createApp(deps: AppDeps) {
  const { db, functionIds } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const teammateProvider = deps.teammateProvider ?? stubProvider;

  async function cardOr404(id: string): Promise<Card> {
    const card = await getCard(db, id);
    if (!card) throw new ApiProblem("not_found", `no card '${id}'`);
    return card;
  }

  async function teammateOr422(id: string, role: string): Promise<Teammate> {
    const t = await getTeammate(db, id);
    if (!t) throw new ApiProblem("rule_violation", `${role} '${id}' is not a teammate`);
    return t;
  }

  /** A person by id: 404 for no such teammate, 422 for an AI teammate, which has no process profile. */
  async function personOr404(id: string): Promise<HumanTeammate> {
    const t = await getTeammate(db, id);
    if (!t) throw new ApiProblem("not_found", `no teammate '${id}'`);
    if (t.kind !== "human") throw new ApiProblem("rule_violation", `${id} is an AI teammate and has no process profile`);
    return t;
  }

  /** The function definitions: the injected ones, or process/functions read on each request. */
  const definitions = () => deps.definitions ?? loadFunctionDefinitions();

  /** Append the events, then answer with the card as it now stands. */
  async function write(cardId: string, events: CardEvent[]): Promise<WriteResponse> {
    const stored = await appendEvents(db, events);
    return { card: await cardOr404(cardId), events: stored.map((s) => cardEvent.parse(s.event)) };
  }

  const base = (cardId: string, actor: string) => ({ id: newId(), card_id: cardId, actor, at: now().toISOString() });

  /** The current cycle at the server's clock, with its whole log; null before any cycle has started. */
  async function boardCycle(): Promise<BoardCycle | null> {
    const current = currentCycle(await listCycles(db), now());
    if (!current) return null;
    return { ...current, log: await cycleLog(db, current.cycle.id) };
  }

  const app = new Hono()
    .basePath("/api")
    .get("/health", (c) => c.json({ ok: true, statuses: cardStatus.options }))

    .get("/board", async (c) => {
      const response: BoardResponse = {
        cards: await listCards(db),
        teammates: await listTeammates(db),
        functions: [...definitions().values()].map((d) => ({ name: d.name, role: d.role, modes: { default: d.modes.default } })),
        open_questions: (await listQuestions(db)).filter((q) => q.answer === undefined),
        log: await boardLog(db, { limit: BOARD_LOG_LIMIT }),
        log_filters: await logFilters(db),
        cycle: await boardCycle(),
        last_seq: await lastSeq(db),
      };
      return c.json(response);
    })

    .get("/cards/:id", async (c) => {
      const card = await cardOr404(c.req.param("id"));
      const response: CardResponse = {
        card,
        log: await cardLog(db, card.id),
        questions: await listQuestions(db, { cardId: card.id }),
        function: (deps.definitions ?? loadFunctionDefinitions()).get(card.function_id) ?? null,
      };
      return c.json(response);
    })

    .post("/cards", async (c) => {
      const req = await body(c, createCardRequest);
      await teammateOr422(req.actor, "actor");
      await teammateOr422(req.owner, "owner");
      for (const link of req.links) await cardOr404(link.card_id);
      const id = await addNumberedCard(
        db,
        {
          title: req.title,
          function_id: req.function_id,
          owner: req.owner,
          links: req.links,
          ...(req.milestone === undefined ? {} : { milestone: req.milestone }),
        },
        functionIds,
      );
      return c.json({ card: await cardOr404(id) }, 201);
    })

    .post("/cards/:id/pick", async (c) => {
      const card = await cardOr404(c.req.param("id"));
      const req = await body(c, pickRequest);
      await teammateOr422(req.actor, "actor");
      const owner = await teammateOr422(card.owner, "owner");
      if (owner.kind !== "human") {
        throw new ApiProblem(
          "rule_violation",
          `owner ${owner.id} is an AI teammate and has no process profile, so ${card.id} cannot be picked`,
        );
      }
      const definition = definitions().get(card.function_id);
      if (!definition) {
        throw new ApiProblem("rule_violation", `no function '${card.function_id}' in process/functions, so ${card.id} cannot be picked`);
      }
      // The owner's choice for the function, or its modes.default, as in the profile and the AI's eligibility.
      const mode = ownerMode(owner, definition);
      if (req.mode !== undefined && req.mode !== mode) {
        throw new ApiProblem(
          "rule_violation",
          `${card.id} is worked in ${mode}, its owner's mode for ${card.function_id}, not ${req.mode}`,
        );
      }
      if (card.status.state !== "ready") {
        throw new ApiProblem("conflict", `${card.id} is ${card.status.state}; only a ready card can be picked`);
      }
      const blockers = unfinishedDependencies(card, await listCards(db));
      if (blockers.length > 0) {
        throw new ApiProblem("conflict", `${card.id} depends on ${blockers.join(", ")}, which is not done`);
      }
      return c.json(
        await write(card.id, [
          { ...base(card.id, req.actor), type: "picked", mode },
          { ...base(card.id, req.actor), type: "status_changed", from: "ready", to: { state: "in_progress" } },
        ]),
      );
    })

    .post("/cards/:id/questions", async (c) => {
      const card = await cardOr404(c.req.param("id"));
      const req = await body(c, askRequest);
      await teammateOr422(req.actor, "actor");
      await teammateOr422(req.asked_of, "asked_of");
      if (card.status.state !== "in_progress") {
        throw new ApiProblem("conflict", `${card.id} is ${card.status.state}; questions are asked on a card in progress`);
      }
      const questionId = newId();
      return c.json(
        await write(card.id, [
          {
            ...base(card.id, req.actor),
            type: "asked",
            question_id: questionId,
            asked_of: req.asked_of,
            text: req.text,
            why_it_blocks: req.why_it_blocks,
          },
          {
            ...base(card.id, req.actor),
            type: "status_changed",
            from: "in_progress",
            to: { state: "needs_input", waiting_on: req.asked_of, question_id: questionId },
          },
        ]),
      );
    })

    .post("/cards/:id/questions/:questionId/answer", async (c) => {
      const card = await cardOr404(c.req.param("id"));
      const questionId = c.req.param("questionId");
      const req = await body(c, answerRequest);
      await teammateOr422(req.actor, "actor");
      const q = (await listQuestions(db, { cardId: card.id })).find((x) => x.id === questionId);
      if (!q) throw new ApiProblem("not_found", `no question '${questionId}' on ${card.id}`);
      if (q.answer !== undefined) throw new ApiProblem("conflict", `question ${questionId} is already answered`);
      const events: CardEvent[] = [{ ...base(card.id, req.actor), type: "answered", question_id: questionId, answer: req.answer }];
      if (card.status.state === "needs_input" && card.status.question_id === questionId) {
        events.push({ ...base(card.id, req.actor), type: "status_changed", from: "needs_input", to: { state: "in_progress" } });
      }
      return c.json(await write(card.id, events));
    })

    .post("/cards/:id/status", async (c) => {
      const card = await cardOr404(c.req.param("id"));
      const req = await body(c, moveStatusRequest);
      await teammateOr422(req.actor, "actor");
      if (!isManualMove(req.from, req.to.state)) {
        throw new ApiProblem(
          "rule_violation",
          `${req.from} to ${req.to.state} is not a status move; picking, asking and answering have their own endpoints`,
        );
      }
      return c.json(
        await write(card.id, [{ ...base(card.id, req.actor), type: "status_changed", from: req.from, to: req.to }]),
      );
    })

    .get("/teammates/:id/profile", async (c) => {
      const id = c.req.param("id");
      const self = await getTeammate(db, id);
      if (self?.kind === "ai") {
        const timer = deps.teammateTimer?.teammateId === self.id ? deps.teammateTimer.intervalMs : undefined;
        const response: AiTeammateProfileResponse = await buildAiProfile(db, self, {
          definitions: definitions(),
          provider: teammateProvider.name,
          timerIntervalMs: timer,
        });
        return c.json(response);
      }
      const person = await personOr404(id);
      const response: TeammateProfileResponse = buildProfile(person, definitions());
      return c.json(response);
    })

    .post("/teammates/:id/modes", async (c) => {
      const person = await personOr404(c.req.param("id"));
      const req = await body(c, setModeRequest);
      await teammateOr422(req.actor, "actor");
      if (req.actor !== person.id) {
        throw new ApiProblem("forbidden", `${req.actor} may not change ${person.id}'s profile; a person sets their own modes`);
      }
      const defs = definitions();
      const definition = defs.get(req.function_id);
      if (!definition) throw new ApiProblem("rule_violation", `no function '${req.function_id}' in process/functions`);
      if (!definition.modes.allowed.includes(req.mode)) {
        throw new ApiProblem(
          "rule_violation",
          `${req.function_id} allows ${definition.modes.allowed.join(", ")}, not ${req.mode}`,
        );
      }
      // Setting the mode the person has already chosen changes nothing, so it records nothing.
      const from = person.process_profile[req.function_id] ?? null;
      if (from !== req.mode) {
        await appendEvents(db, [
          {
            id: newId(),
            type: "mode_changed",
            teammate_id: person.id,
            actor: req.actor,
            at: now().toISOString(),
            function_id: req.function_id,
            from,
            to: req.mode,
          },
        ]);
      }
      const response: TeammateProfileResponse = buildProfile(await personOr404(person.id), defs);
      return c.json(response);
    })

    .post("/teammates/:id/roles", async (c) => {
      const person = await personOr404(c.req.param("id"));
      const req = await body(c, setRolesRequest);
      const actor = await teammateOr422(req.actor, "actor");
      if (actor.kind !== "human") throw new ApiProblem("forbidden", `roles are set by a person, not ${actor.id}`);
      // Asking for the roles the person already holds changes nothing, so it records nothing.
      // Otherwise `was` is what the caller saw; the store refuses it with 409 if the roles have moved on.
      if (!sameRoles(person.roles, req.roles)) {
        await appendEvents(db, [
          {
            id: newId(),
            type: "roles_changed",
            teammate_id: person.id,
            actor: actor.id,
            at: now().toISOString(),
            from: req.was,
            to: req.roles,
          },
        ]);
      }
      const response: TeammateResponse = { teammate: await personOr404(person.id) };
      return c.json(response);
    })

    .post("/logs/:log/filter", async (c) => {
      const log = logName.safeParse(c.req.param("log"));
      if (!log.success) throw new ApiProblem("not_found", `no log '${c.req.param("log")}'; the logs are ${logName.options.join(", ")}`);
      const req = await body(c, setLogFilterRequest);
      const actor = await teammateOr422(req.actor, "actor");
      if (actor.kind !== "human") throw new ApiProblem("forbidden", `a log's filter is set by a person, not ${actor.id}`);
      // Asking for the filter the log already has changes nothing, so it records nothing.
      // Otherwise `was_hidden` is what the caller saw; the store refuses it with 409 if the log has moved on.
      if (!sameEventTypes((await logFilters(db))[log.data], req.hidden)) {
        await appendEvents(db, [
          {
            id: newId(),
            type: "log_filter_changed",
            actor: actor.id,
            at: now().toISOString(),
            log: log.data,
            hidden: normalizeEventTypes(req.hidden),
            was_hidden: normalizeEventTypes(req.was_hidden),
          },
        ]);
      }
      const response: LogFiltersResponse = { log_filters: await logFilters(db) };
      return c.json(response);
    })

    .post("/teammates/:id/run", async (c) => {
      const id = c.req.param("id");
      const self = await getTeammate(db, id);
      if (!self) throw new ApiProblem("not_found", `no teammate '${id}'`);
      if (self.kind !== "ai") throw new ApiProblem("rule_violation", `${id} is not an AI teammate; only an AI teammate is run`);
      const run = await runTeammate(db, {
        teammateId: id,
        provider: teammateProvider,
        now,
        newId,
        ...(deps.definitions === undefined ? {} : { definitions: deps.definitions }),
      });
      if (!run) throw new ApiProblem("conflict", `${id} has no card it may pick`);
      const response: TeammateRunResponse = { card: await cardOr404(run.card.id), events: run.events };
      return c.json(response);
    })

    .post("/github/webhook", async (c) => {
      const secret = deps.githubWebhookSecret;
      if (!secret) throw new ApiProblem("unavailable", "GITHUB_WEBHOOK_SECRET is not set, so no webhook signature can be checked");
      // The signature covers the body exactly as sent, so it is read as text and checked before parsing.
      const raw = await c.req.text();
      if (!validSignature(secret, raw, c.req.header("x-hub-signature-256"))) {
        throw new ApiProblem("unauthorized", "X-Hub-Signature-256 is missing or does not match the body");
      }
      const event = c.req.header("x-github-event");
      const deliveryId = c.req.header("x-github-delivery");
      if (!event || !deliveryId) throw new ApiProblem("invalid_request", "X-GitHub-Event and X-GitHub-Delivery are required");
      // A webhook may be set to send JSON, or a form with the JSON in `payload`.
      const form = (c.req.header("content-type") ?? "").includes("application/x-www-form-urlencoded");
      let payload: unknown;
      try {
        payload = JSON.parse(form ? (new URLSearchParams(raw).get("payload") ?? "") : raw);
      } catch {
        throw new ApiProblem("invalid_request", "the webhook body is not JSON");
      }
      try {
        const response: WebhookResponse = await handleDelivery(
          { db, logins: deps.githubLogins ?? new Map<string, string>(), now },
          { event, id: deliveryId, payload },
        );
        return c.json(response);
      } catch (err) {
        if (err instanceof WebhookPayloadError) throw new ApiProblem("invalid_request", err.message);
        throw err;
      }
    })

    .get("/events", async (c) => {
      const start = await startingPoint(c, db);
      if (start === undefined) {
        throw new ApiProblem("invalid_request", "Last-Event-ID and ?after= must be a stream position (a whole number)");
      }
      return eventStream(c, db, start);
    });

  app.onError((err, c) => {
    if (err instanceof ApiProblem) return problem(c, err.code, err.message, err.issues);
    if (err instanceof StoreError) return problem(c, fromStoreCode[err.code], err.message);
    if (err instanceof z.ZodError) return problem(c, "rule_violation", err.message, issuesOf(err));
    console.error(err);
    return c.json({ error: "internal", reason: "unexpected server error" }, 500);
  });

  return app;
}

function problem(c: Context, code: ApiErrorCode, reason: string, issues?: ApiError["issues"]) {
  const payload: ApiError = issues === undefined ? { error: code, reason } : { error: code, reason, issues };
  return c.json(payload, httpStatus[code]);
}

export type AppType = ReturnType<typeof createApp>;
