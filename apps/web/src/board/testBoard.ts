// INVENTED test data for the board view-model tests. None of it describes a
// real client, project or person.
import type { BoardResponse, Card, CardEvent } from "@workbench/shared";

export const PO = "t-po";
export const UX = "t-ux";
export const BE = "t-be";
export const AI = "t-ai";

const at = (minute: number) => `2026-11-06T09:${String(minute).padStart(2, "0")}:00Z`;

export function card(id: string, over: Partial<Card> = {}): Card {
  return { id, title: `Invented card ${id}`, function_id: "frame_problem", owner: UX, status: { state: "backlog" }, links: [], ...over };
}

export function testBoard(over: Partial<BoardResponse> = {}): BoardResponse {
  const log: CardEvent[] = [
    { id: "e1", type: "picked", card_id: "c-142", actor: UX, at: at(30), mode: "assist" },
    { id: "e2", type: "picked", card_id: "c-145", actor: AI, at: at(31), mode: "delegate" },
    { id: "e3", type: "check_ran", card_id: "c-138", actor: AI, at: at(32), check: "structural", passed: true, summary: "Invented: fine." },
    { id: "e4", type: "report_posted", card_id: "c-138", actor: UX, at: at(38), text: "Invented: report." },
    { id: "e5", type: "status_changed", card_id: "c-138", actor: UX, at: at(39), from: "review", to: { state: "done" } },
    { id: "e6", type: "picked", card_id: "c-151", actor: AI, at: at(40), mode: "assist" },
    {
      id: "e7",
      type: "asked",
      card_id: "c-151",
      actor: AI,
      at: at(41),
      question_id: "q-151",
      asked_of: BE,
      text: "Invented: page numbers or a cursor?",
      why_it_blocks: "Invented: it changes the shape.",
    },
    {
      id: "e8",
      type: "status_changed",
      card_id: "c-151",
      actor: AI,
      at: at(41),
      from: "in_progress",
      to: { state: "needs_input", waiting_on: BE, question_id: "q-151" },
    },
  ];
  return {
    teammates: [
      { kind: "human", id: PO, name: "Robin Example (invented product owner)", process_profile: { write_issues: "delegate" } },
      { kind: "human", id: UX, name: "Sam Example", process_profile: { frame_problem: "assist", fix_bug: "manual" } },
      { kind: "human", id: BE, name: "Pat Example", process_profile: { define_api_contract: "assist" } },
      { kind: "ai", id: AI, name: "AI teammate (invented)" },
    ],
    cards: [
      card("c-138", { status: { state: "done" } }),
      card("c-142", { status: { state: "in_progress" } }),
      card("c-145", { function_id: "write_issues", owner: PO, status: { state: "review" } }),
      card("c-151", {
        function_id: "define_api_contract",
        owner: BE,
        status: { state: "needs_input", waiting_on: BE, question_id: "q-151" },
      }),
      card("c-152", {
        function_id: "define_api_contract",
        owner: BE,
        status: { state: "ready" },
        links: [{ relation: "depends_on", card_id: "c-151" }],
      }),
    ],
    open_questions: [
      {
        id: "q-151",
        card_id: "c-151",
        asked_by: AI,
        asked_of: BE,
        text: "Invented: page numbers or a cursor?",
        why_it_blocks: "Invented: it changes the shape.",
      },
    ],
    log,
    last_seq: log.length,
    ...over,
  };
}
