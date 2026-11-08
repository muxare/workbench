// INVENTED EXAMPLE DATA. Every teammate, card, question and event below is made
// up for the ConCon demo on 2026-11-18; none of it describes a real client or
// project. It follows the cards in the Claude Design concept (docs/design/).
//
// This is the only module that holds seed data. A real project (the Phase 2
// run, see docs/decisions.md, 2026-11-08) replaces it by exporting another
// `SeedData`; nothing else needs to change. Function ids must be names of
// files in process/functions; `seed()` checks them against process/.
import type { CardEvent } from "@workbench/shared";
import type { SeedData } from "../store.ts";

const PO = "invented-po";
const UX = "invented-ux";
const FE = "invented-fe";
const BE = "invented-be";
const AI = "invented-ai";

const milestone = "Self-service onboarding (invented)";

/** A card event without its id, one variant at a time. */
type NewEvent = CardEvent extends infer E ? (E extends CardEvent ? Omit<E, "id"> : never) : never;

let n = 0;
/** An event with the next invented id. Events are listed in stream order. */
function e(event: NewEvent): CardEvent {
  n += 1;
  return { ...event, id: `invented-e${String(n).padStart(3, "0")}` } as CardEvent;
}

export const inventedSeed: SeedData = {
  teammates: [
    { kind: "human", id: PO, name: "Robin Example (invented product owner)", process_profile: { write_issues: "delegate" } },
    { kind: "human", id: UX, name: "Sam Example (invented UX designer)", process_profile: { frame_problem: "assist" } },
    {
      kind: "human",
      id: FE,
      name: "Alex Example (invented frontend developer)",
      process_profile: { refine_ui_spec: "assist", write_issues: "delegate" },
    },
    { kind: "human", id: BE, name: "Pat Example (invented backend developer)", process_profile: { define_api_contract: "assist" } },
    { kind: "ai", id: AI, name: "AI teammate (invented)" },
  ],

  cycles: [
    { id: "invented-sprint-13", name: "Sprint 13 (invented)", starts_at: "2026-10-19T08:00:00Z", ends_at: "2026-11-02T08:00:00Z" },
    { id: "invented-sprint-14", name: "Sprint 14 (invented)", starts_at: "2026-11-02T08:00:00Z", ends_at: "2026-11-16T08:00:00Z" },
  ],

  cards: [
    { id: "invented-138", title: "Invented: refine the sign-up form spec", function_id: "refine_ui_spec", owner: FE, milestone, links: [] },
    { id: "invented-142", title: "Invented: frame the onboarding problem", function_id: "frame_problem", owner: UX, milestone, links: [] },
    { id: "invented-145", title: "Invented: write issues for the welcome flow", function_id: "write_issues", owner: FE, milestone, links: [] },
    { id: "invented-147", title: "Invented: refine the profile setup spec", function_id: "refine_ui_spec", owner: FE, milestone, links: [] },
    { id: "invented-149", title: "Invented: write issues for team invites", function_id: "write_issues", owner: PO, milestone, links: [] },
    { id: "invented-151", title: "Invented: define the members list contract", function_id: "define_api_contract", owner: BE, milestone, links: [] },
    {
      id: "invented-152",
      title: "Invented: define the invite contract",
      function_id: "define_api_contract",
      owner: BE,
      milestone,
      links: [{ relation: "depends_on", card_id: "invented-151" }],
    },
    { id: "invented-153", title: "Invented: frame the account recovery problem", function_id: "frame_problem", owner: UX, links: [] },
  ],

  events: [
    // Sprint 13: #138 starts.
    e({ type: "status_changed", card_id: "invented-138", actor: PO, at: "2026-10-28T09:00:00Z", from: "backlog", to: { state: "ready" } }),
    e({ type: "picked", card_id: "invented-138", actor: FE, at: "2026-10-29T10:00:00Z", mode: "assist" }),
    e({ type: "status_changed", card_id: "invented-138", actor: FE, at: "2026-10-29T10:00:05Z", from: "ready", to: { state: "in_progress" } }),

    // Sprint 14: the product owner orders the board.
    e({ type: "status_changed", card_id: "invented-142", actor: PO, at: "2026-11-03T08:30:00Z", from: "backlog", to: { state: "ready" } }),
    e({ type: "status_changed", card_id: "invented-145", actor: PO, at: "2026-11-03T08:31:00Z", from: "backlog", to: { state: "ready" } }),
    e({ type: "status_changed", card_id: "invented-147", actor: PO, at: "2026-11-03T08:32:00Z", from: "backlog", to: { state: "ready" } }),
    e({ type: "status_changed", card_id: "invented-149", actor: PO, at: "2026-11-03T08:33:00Z", from: "backlog", to: { state: "ready" } }),
    e({ type: "status_changed", card_id: "invented-151", actor: PO, at: "2026-11-03T08:34:00Z", from: "backlog", to: { state: "ready" } }),
    e({ type: "status_changed", card_id: "invented-152", actor: PO, at: "2026-11-03T08:35:00Z", from: "backlog", to: { state: "ready" } }),

    // #138 goes through its checks and review to done.
    e({
      type: "check_ran",
      card_id: "invented-138",
      actor: AI,
      at: "2026-11-03T14:00:00Z",
      check: "structural",
      passed: true,
      summary: "Invented: every required field of the UI spec is filled.",
    }),
    e({ type: "status_changed", card_id: "invented-138", actor: FE, at: "2026-11-04T09:10:00Z", from: "in_progress", to: { state: "review" } }),

    // The AI drafts #145 in delegate mode, the mode its owner set for write_issues.
    e({ type: "picked", card_id: "invented-145", actor: AI, at: "2026-11-04T10:00:00Z", mode: "delegate" }),
    e({ type: "status_changed", card_id: "invented-145", actor: AI, at: "2026-11-04T10:00:05Z", from: "ready", to: { state: "in_progress" } }),
    e({ type: "report_posted", card_id: "invented-145", actor: AI, at: "2026-11-05T16:20:00Z", text: "Invented: draft issues are ready for the owner to verify." }),
    e({ type: "status_changed", card_id: "invented-145", actor: AI, at: "2026-11-05T16:20:05Z", from: "in_progress", to: { state: "review" } }),

    // The AI assists on #147 and runs its structural check.
    e({ type: "picked", card_id: "invented-147", actor: AI, at: "2026-11-05T11:00:00Z", mode: "assist" }),
    e({ type: "status_changed", card_id: "invented-147", actor: AI, at: "2026-11-05T11:00:05Z", from: "ready", to: { state: "in_progress" } }),
    e({
      type: "check_ran",
      card_id: "invented-147",
      actor: AI,
      at: "2026-11-06T08:45:00Z",
      check: "structural",
      passed: false,
      summary: "Invented: the empty state for the avatar upload is missing.",
    }),

    // The AI drafts #149 for the product owner.
    e({ type: "picked", card_id: "invented-149", actor: AI, at: "2026-11-06T09:00:00Z", mode: "delegate" }),
    e({ type: "status_changed", card_id: "invented-149", actor: AI, at: "2026-11-06T09:00:05Z", from: "ready", to: { state: "in_progress" } }),

    // The AI picks #151 and works it in the backend developer's mode.
    e({ type: "picked", card_id: "invented-151", actor: AI, at: "2026-11-06T09:20:00Z", mode: "assist" }),
    e({ type: "status_changed", card_id: "invented-151", actor: AI, at: "2026-11-06T09:20:05Z", from: "ready", to: { state: "in_progress" } }),

    // UX picks #142; the AI asks, the card waits, UX answers, work resumes.
    e({ type: "picked", card_id: "invented-142", actor: UX, at: "2026-11-06T09:30:00Z", mode: "assist" }),
    e({ type: "status_changed", card_id: "invented-142", actor: UX, at: "2026-11-06T09:30:05Z", from: "ready", to: { state: "in_progress" } }),
    e({
      type: "asked",
      card_id: "invented-142",
      actor: AI,
      at: "2026-11-06T09:31:00Z",
      question_id: "invented-q142",
      asked_of: UX,
      text: "Invented: who is the primary user, the team admin or the invited member?",
      why_it_blocks: "Invented: the problem statement and success criteria depend on it.",
    }),
    e({
      type: "status_changed",
      card_id: "invented-142",
      actor: AI,
      at: "2026-11-06T09:31:05Z",
      from: "in_progress",
      to: { state: "needs_input", waiting_on: UX, question_id: "invented-q142" },
    }),

    // #138 is done.
    e({ type: "report_posted", card_id: "invented-138", actor: FE, at: "2026-11-06T09:38:00Z", text: "Invented: check report attached." }),
    e({ type: "status_changed", card_id: "invented-138", actor: FE, at: "2026-11-06T09:38:05Z", from: "review", to: { state: "done" } }),

    // The AI needs the backend developer's call on #151.
    e({
      type: "asked",
      card_id: "invented-151",
      actor: AI,
      at: "2026-11-06T09:41:00Z",
      question_id: "invented-q151",
      asked_of: BE,
      text: "Invented: page numbers or a cursor for the members list?",
      why_it_blocks: "Invented: it changes the response shape the UI spec relies on.",
    }),
    e({
      type: "status_changed",
      card_id: "invented-151",
      actor: AI,
      at: "2026-11-06T09:41:05Z",
      from: "in_progress",
      to: { state: "needs_input", waiting_on: BE, question_id: "invented-q151" },
    }),

    // UX answers on #142 and it goes back to In progress.
    e({
      type: "answered",
      card_id: "invented-142",
      actor: UX,
      at: "2026-11-06T09:52:00Z",
      question_id: "invented-q142",
      answer: "Invented: the team admin; invited members come in a later milestone.",
    }),
    e({ type: "status_changed", card_id: "invented-142", actor: UX, at: "2026-11-06T09:52:05Z", from: "needs_input", to: { state: "in_progress" } }),
  ],
};
