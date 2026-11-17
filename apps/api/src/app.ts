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
// `POST /api/functions/:id/critic-gate` appends a `critic_gate_changed` event
// about the team, which sets whether the AI critic must pass before a
// person's approval lets a merge move a card of that function to done;
// `GET /api/functions/critic-gates` answers every gate someone has set.
// `GET /api/teammates/:id/profile` reads the person's chain of steps from
// process/functions on each request, with each step's critic gate; for an AI
// teammate it answers a separate, derived profile (aiProfile.ts).
// `GET /api/team` answers every person against every step, each cell built by
// the same code as that person's profile (team.ts).
// `GET /api/board` also carries the current cycle (`currentCycle` at the
// server's clock) and its cycle log, for the panel under the board, and each
// function's name, role and default mode from process/functions, so a panel
// counts modes over the same chain as the profile.
// `POST /api/cards/:id/reports` appends a `report_posted` event, which is how
// an agent session (apps/mcp) reports on the card it works.
// `POST /api/cards/:id/pick` by an AI teammate also checks the rules its
// runner follows (teammates/eligibility.ts), with the modes it works in from
// an agent session.
// `POST /api/batches` appends a `batch_handed` event: a person hands several
// Ready cards to the AI teammate as one batch, refused when the AI may not
// pick a card by the same rules as a pick from an agent session.
// `POST /api/batches/:id/plan` appends the AI's `batch_planned` event, and
// `GET /api/batches`, `GET /api/batches/:id` and the board's `batches` are
// derived from those events and the cards' statuses (docs/dev-loop.md,
// stage 3b).
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
  batchListState,
  cardEvent,
  cardStatus,
  checkPlan,
  handBatchRequest,
  openBatches,
  planBatchRequest,
  type Batch,
  type BatchDetailResponse,
  type BatchesResponse,
  type BatchResponse,
  createCardRequest,
  criticRequired,
  currentCycle,
  isManualMove,
  logName,
  normalizeEventTypes,
  ownerMode,
  moveStatusRequest,
  pickRequest,
  reportRequest,
  sameEventTypes,
  sameRoles,
  setCriticGateRequest,
  setLogFilterRequest,
  setModeRequest,
  setRolesRequest,
  batchCards,
  unmetDependencies,
  moveFunction,
  type HumanTeammate,
  type TeammateResponse,
  type TeammateProfileResponse,
  type TeamResponse,
  type AiTeammateProfileResponse,
  type ApiError,
  type ApiErrorCode,
  type CriticGatesResponse,
  type BoardCycle,
  type BoardResponse,
  type Card,
  type CardEvent,
  type CardResponse,
  type CardStatus,
  type FunctionFrontMatter,
  type LogFiltersResponse,
  type Teammate,
  type TeammateRunResponse,
  type WebhookResponse,
  type WriteResponse,
} from "@workbench/shared";
import type { Db } from "./db/client.ts";
import { loadExternalArtifacts, loadFunctionDefinitions } from "./process.ts";
import { buildAiProfile, cardsInHand } from "./aiProfile.ts";
import { buildProfile } from "./profile.ts";
import { buildTeam } from "./team.ts";
import { eventStream, startingPoint } from "./sse.ts";
import { validSignature } from "./github/signature.ts";
import { handleDelivery, WebhookPayloadError } from "./github/webhook.ts";
import {
  addNumberedCard,
  appendEvents,
  boardLog,
  cardLog,
  criticGates,
  cycleLog,
  getBatch,
  getCard,
  getTeammate,
  handBatch,
  lastSeq,
  listBatches,
  listCards,
  listCycles,
  listQuestions,
  listTeammates,
  logFilters,
  StoreError,
  teamName,
  type StoreErrorCode,
} from "./store.ts";
import type { TeammateProvider } from "./teammates/provider.ts";
import { checkEligibility, SESSION_MODES } from "./teammates/eligibility.ts";
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
  /**
   * The ids of the artifacts made outside the team, which a question may be
   * for. Defaults to process/artifacts.md, read on each such question.
   */
  externalArtifacts?: ReadonlySet<string>;
  /** The optional timer (TEAMMATE_INTERVAL_MS) and the AI teammate it runs, for that teammate's profile. */
  teammateTimer?: { teammateId: string; intervalMs: number };
  /** The secret GitHub signs webhooks with (GITHUB_WEBHOOK_SECRET); without it the webhook endpoint answers 503. */
  githubWebhookSecret?: string;
  /** GitHub login (lower case) to teammate id (GITHUB_LOGINS); a webhook from an unmapped account records nothing. */
  githubLogins?: ReadonlyMap<string, string>;
}

/** The states a card is being worked in, where `POST /cards/:id/reports` accepts a report. */
const REPORTABLE: readonly CardStatus[] = ["in_progress", "needs_input", "review"];

/** How many of the latest events `GET /board` returns as its log. */
const BOARD_LOG_LIMIT = 50;

const httpStatus = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  already_planned: 409,
  rule_violation: 422,
  unavailable: 503,
} as const satisfies Record<ApiErrorCode, number>;

const fromStoreCode: Record<StoreErrorCode, ApiErrorCode> = {
  conflict: "conflict",
  already_planned: "already_planned",
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

  /** A card as `GET /cards/:id` answers it: with its log, its questions and its function's definition. */
  async function cardDetail(card: Card, defs: ReadonlyMap<string, FunctionFrontMatter> = definitions()): Promise<CardResponse> {
    return {
      card,
      log: await cardLog(db, card.id),
      questions: await listQuestions(db, { cardId: card.id }),
      function: defs.get(card.function_id) ?? null,
    };
  }

  async function batchOr404(id: string): Promise<Batch> {
    const batch = await getBatch(db, id);
    if (!batch) throw new ApiProblem("not_found", `no batch '${id}'`);
    return batch;
  }

  /** The AI teammate a batch goes to: the one named, or the team's only AI teammate. */
  async function batchTeammate(handedTo: string | undefined): Promise<Teammate> {
    if (handedTo !== undefined) {
      const t = await teammateOr422(handedTo, "handed_to");
      if (t.kind !== "ai") throw new ApiProblem("rule_violation", `handed_to '${t.id}' is not an AI teammate; a batch is handed to the AI`);
      return t;
    }
    const ais = (await listTeammates(db)).filter((t) => t.kind === "ai");
    if (ais.length !== 1) {
      throw new ApiProblem(
        "rule_violation",
        `the team has ${ais.length === 0 ? "no AI teammate" : `${String(ais.length)} AI teammates`}, so handed_to must name one`,
      );
    }
    return ais[0]!;
  }

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
        team: await teamName(db),
        cards: await listCards(db),
        teammates: await listTeammates(db),
        // Only what the board needs of each function: its name, role, default mode and who writes in each mode.
        functions: [...definitions().values()].map((d) => moveFunction.parse(d)),
        open_questions: (await listQuestions(db)).filter((q) => q.answer === undefined),
        log: await boardLog(db, { limit: BOARD_LOG_LIMIT }),
        log_filters: await logFilters(db),
        cycle: await boardCycle(),
        batches: openBatches(await listBatches(db)),
        last_seq: await lastSeq(db),
      };
      return c.json(response);
    })

    .get("/cards/:id", async (c) => {
      const response: CardResponse = await cardDetail(await cardOr404(c.req.param("id")));
      return c.json(response);
    })

    .get("/batches", async (c) => {
      const raw = c.req.query("state");
      const state = raw === undefined ? undefined : batchListState.safeParse(raw);
      if (state && !state.success) {
        throw new ApiProblem("invalid_request", `state must be ${batchListState.options.join(" or ")}, not '${raw ?? ""}'`);
      }
      const open = openBatches(await listBatches(db));
      const response: BatchesResponse = { batches: state ? open.filter((b) => b.state === state.data) : open };
      return c.json(response);
    })

    .get("/batches/:id", async (c) => {
      const batch = await batchOr404(c.req.param("id"));
      const defs = definitions();
      const cards: CardResponse[] = [];
      for (const id of batchCards(batch)) cards.push(await cardDetail(await cardOr404(id), defs));
      const response: BatchDetailResponse = { batch, cards };
      return c.json(response);
    })

    .post("/batches", async (c) => {
      const req = await body(c, handBatchRequest);
      const actor = await teammateOr422(req.actor, "actor");
      if (actor.kind !== "human") throw new ApiProblem("forbidden", `a batch is handed over by a person, not ${actor.id}`);
      const handedTo = await batchTeammate(req.handed_to);
      const handed: Card[] = [];
      for (const id of req.card_ids) handed.push(await cardOr404(id));
      const defs = definitions();
      const cards = await listCards(db);
      const teammates = await listTeammates(db);
      const open = openBatches(await listBatches(db));
      for (const card of handed) {
        const holder = open.find((b) => batchCards(b).includes(card.id));
        if (holder) throw new ApiProblem("conflict", `${card.id} is already in batch ${holder.id}, which is not finished`);
        // The AI may pick each card by the rules of a pick from an agent
        // session, with one difference: the plan puts a card after the batch
        // cards it depends on, so those count as done here. A dependency
        // outside the batch must be done already.
        const assumed = cards.map((other) =>
          other.id !== card.id && req.card_ids.includes(other.id) ? { ...other, status: { state: "done" as const } } : other,
        );
        const verdict = checkEligibility(card, await cardLog(db, card.id), defs, teammates, assumed, SESSION_MODES);
        if (!verdict.eligible) throw new ApiProblem("conflict", `${handedTo.id} may not pick ${verdict.reason}`);
      }
      // The store reads the next batch id and appends the event in one serialized write.
      const event = await handBatch(db, { id: newId(), actor: actor.id, at: now().toISOString(), card_ids: req.card_ids, handed_to: handedTo.id });
      const response: BatchResponse = { batch: await batchOr404(event.batch_id) };
      return c.json(response, 201);
    })

    .post("/batches/:id/plan", async (c) => {
      const batch = await batchOr404(c.req.param("id"));
      const req = await body(c, planBatchRequest);
      await teammateOr422(req.actor, "actor");
      if (req.actor !== batch.handed_to) {
        throw new ApiProblem("forbidden", `batch ${batch.id} was handed to ${batch.handed_to}, so ${req.actor} may not plan it`);
      }
      if (batch.plan !== null) throw new ApiProblem("already_planned", `batch ${batch.id} already has a plan`);
      if (batch.state === "finished") throw new ApiProblem("conflict", `batch ${batch.id} is finished, so it takes no plan`);
      const verdict = checkPlan(batchCards(batch), req.waves, await listCards(db));
      if (!verdict.ok) throw new ApiProblem("conflict", `the plan for batch ${batch.id} is not valid: ${verdict.reason}`);
      // The store checks the plan again inside the write, so two plans posted at once cannot both land.
      await appendEvents(db, [
        { id: newId(), type: "batch_planned", actor: req.actor, at: now().toISOString(), batch_id: batch.id, waves: req.waves },
      ]);
      const response: BatchResponse = { batch: await batchOr404(batch.id) };
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
      const actor = await teammateOr422(req.actor, "actor");
      const owner = await teammateOr422(card.owner, "owner");
      if (owner.kind !== "human") {
        throw new ApiProblem(
          "rule_violation",
          `owner ${owner.id} is an AI teammate and has no process profile, so ${card.id} cannot be picked`,
        );
      }
      const defs = definitions();
      const definition = defs.get(card.function_id);
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
      const cards = await listCards(db);
      // For the AI, a dependency in an earlier wave of a plan for a batch handed to it is met (`unmetDependencies`).
      const batches = actor.kind === "ai" ? (await listBatches(db)).filter((b) => b.handed_to === actor.id) : [];
      const blockers = unmetDependencies(card, cards, batches);
      if (blockers.length > 0) {
        throw new ApiProblem("conflict", `${card.id} depends on ${blockers.join(", ")}, which is not done`);
      }
      // The AI teammate picks only where the owner's mode gives it a part, by
      // the same rules as its runner, in the modes it works in from an agent session.
      if (actor.kind === "ai") {
        const verdict = checkEligibility(card, await cardLog(db, card.id), defs, await listTeammates(db), cards, SESSION_MODES, batches);
        if (!verdict.eligible) throw new ApiProblem("rule_violation", `${actor.id} may not pick ${verdict.reason}`);
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
      const askedOf = await teammateOr422(req.asked_of, "asked_of");
      if (req.external) {
        // Nobody outside the team has an account: a person relays the
        // question and records the answer, so `decides` stays human.
        if (askedOf.kind !== "human") {
          throw new ApiProblem("rule_violation", `asked_of '${askedOf.id}' relays a question outside the team, so it must be a person`);
        }
        const external = deps.externalArtifacts ?? loadExternalArtifacts();
        if (!external.has(req.external.artifact)) {
          throw new ApiProblem(
            "rule_violation",
            `external.artifact '${req.external.artifact}' is not an artifact made outside the team in process/artifacts.md`,
          );
        }
      }
      if (card.status.state !== "in_progress") {
        throw new ApiProblem("conflict", `${card.id} is ${card.status.state}; questions are asked on a card in progress`);
      }
      const questionId = newId();
      const waitingOn = req.external ? { ...req.external, relayed_by: req.asked_of } : req.asked_of;
      return c.json(
        await write(card.id, [
          {
            ...base(card.id, req.actor),
            type: "asked",
            question_id: questionId,
            asked_of: req.asked_of,
            ...(req.external ? { external: req.external } : {}),
            text: req.text,
            why_it_blocks: req.why_it_blocks,
          },
          {
            ...base(card.id, req.actor),
            type: "status_changed",
            from: "in_progress",
            to: { state: "needs_input", waiting_on: waitingOn, question_id: questionId },
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

    .post("/cards/:id/reports", async (c) => {
      const card = await cardOr404(c.req.param("id"));
      const req = await body(c, reportRequest);
      const actor = await teammateOr422(req.actor, "actor");
      if (!REPORTABLE.includes(card.status.state)) {
        throw new ApiProblem(
          "conflict",
          `${card.id} is ${card.status.state}; a report is posted on a card in ${REPORTABLE.join(", ")}`,
        );
      }
      // The AI teammate reports only on a card it holds: it made the card's last pick, as its profile works out.
      if (actor.kind === "ai" && cardsInHand(actor.id, [card], await cardLog(db, card.id)).length === 0) {
        throw new ApiProblem("forbidden", `${actor.id} did not pick ${card.id} last, so it may not report on it`);
      }
      return c.json(await write(card.id, [{ ...base(card.id, req.actor), type: "report_posted", text: req.text }]));
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

    .get("/team", async (c) => {
      const response: TeamResponse = buildTeam(await listTeammates(db), definitions());
      return c.json(response);
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
      const response: TeammateProfileResponse = buildProfile(person, definitions(), await criticGates(db));
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
      const response: TeammateProfileResponse = buildProfile(await personOr404(person.id), defs, await criticGates(db));
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

    .get("/functions/critic-gates", async (c) => {
      const response: CriticGatesResponse = { critic_gates: await criticGates(db) };
      return c.json(response);
    })

    .post("/functions/:id/critic-gate", async (c) => {
      const functionId = c.req.param("id");
      if (!functionIds.has(functionId)) throw new ApiProblem("not_found", `no function '${functionId}' in process/functions`);
      const req = await body(c, setCriticGateRequest);
      const actor = await teammateOr422(req.actor, "actor");
      if (actor.kind !== "human") throw new ApiProblem("forbidden", `a function's critic gate is set by a person, not ${actor.id}`);
      // Asking for the setting the function already has changes nothing, so it records nothing.
      // Otherwise `was_required` is what the caller saw; the store refuses it with 409 if the setting has moved on.
      if (criticRequired(await criticGates(db), functionId) !== req.required) {
        await appendEvents(db, [
          {
            id: newId(),
            type: "critic_gate_changed",
            actor: actor.id,
            at: now().toISOString(),
            function_id: functionId,
            required: req.required,
            was_required: req.was_required,
          },
        ]);
      }
      const response: CriticGatesResponse = { critic_gates: await criticGates(db) };
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
        ...(deps.externalArtifacts === undefined ? {} : { externalArtifacts: deps.externalArtifacts }),
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
          { db, logins: deps.githubLogins ?? new Map<string, string>(), definitions: definitions(), now },
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
