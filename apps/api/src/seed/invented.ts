// INVENTED EXAMPLE DATA. Every teammate, card, question and event below is made
// up for developing and demonstrating the workbench; none of it describes a
// real client, cooperative, project or person. It is the laundry room project
// in examples/laundry-room/: the team and cast from its README, and the log
// from history.md, the answer key.
//
// The board is a snapshot at the end of 2026-10-06, in step 7 of the history:
// the fault-status contract (#106) waits on the product owner, who has passed
// the AI's question to the caretaker, and I-8 (#107), which #106 depends on, is
// in progress. Two things go beyond the history:
// - #108, refining the booking reminder screens for I-3, is in Ready so the AI
//   teammate has a card to pick. The history does not say when I-3 was refined.
// - #107 is a `write_issues` card. I-8 is work for the product owner and the
//   caretaker that no function in process/ describes, but every card needs a
//   function, and #106 needs a card to depend on.
// A card's links have no events, so #106 depends on #107 from the start,
// although the history adds the link only after #106 was picked on 2026-09-29.
// Each owner has one mode per function, so Alex's manual step (#105) and Pat's
// delegate step (#104) are recorded in their `picked` events, while the
// profiles hold the modes of the latest steps.
//
// This is the only module that holds seed data. A real project (the Phase 2
// run, see docs/decisions.md, 2026-11-08) replaces it by exporting another
// `SeedData`; nothing else needs to change. Function ids must be names of
// files in process/functions; `seed()` checks them against process/.
import type { CardEvent, CardStatus, Mode } from "@workbench/shared";
import type { SeedData } from "../store.ts";

const PO = "invented-po";
const UX = "invented-ux";
const FE = "invented-fe";
const BE = "invented-be";
const AI = "invented-ai";

const milestone = "Laundry room service, first version (invented)";

/** A card event without its id, one variant at a time. */
type NewEvent = CardEvent extends infer E ? (E extends CardEvent ? Omit<E, "id"> : never) : never;

/** The states a card can be moved out of without answering a question. */
type Settled = Exclude<CardStatus, "needs_input" | "done">;

const at = (day: string, time: string) => `2026-${day}T${time}:00Z`;

/** Moves a card from one state to another state that needs no question. */
function move(card_id: string, actor: string, when: string, from: Settled, to: Settled | "done"): NewEvent {
  return { type: "status_changed", card_id, actor, at: when, from, to: { state: to } };
}

/** The AI asks `asked_of`, and the card waits on them. */
function ask(card_id: string, when: string, question_id: string, asked_of: string, text: string, why_it_blocks: string): NewEvent[] {
  return [
    { type: "asked", card_id, actor: AI, at: when, question_id, asked_of, text, why_it_blocks },
    { type: "status_changed", card_id, actor: AI, at: when, from: "in_progress", to: { state: "needs_input", waiting_on: asked_of, question_id } },
  ];
}

/** A person answers, and the card goes back to In progress. */
function answer(card_id: string, actor: string, when: string, question_id: string, text: string): NewEvent[] {
  return [
    { type: "answered", card_id, actor, at: when, question_id, answer: text },
    { type: "status_changed", card_id, actor, at: when, from: "needs_input", to: { state: "in_progress" } },
  ];
}

function report(card_id: string, actor: string, when: string, text: string): NewEvent {
  return { type: "report_posted", card_id, actor, at: when, text };
}

function check(card_id: string, actor: string, when: string, kind: "structural" | "consistency" | "human", passed: boolean, summary: string): NewEvent {
  return { type: "check_ran", card_id, actor, at: when, check: kind, passed, summary };
}

function pick(card_id: string, actor: string, when: string, mode: Mode): NewEvent[] {
  return [{ type: "picked", card_id, actor, at: when, mode }, move(card_id, actor, when, "ready", "in_progress")];
}

// The history, step by step. Each step's events are in order; the steps
// overlap in time, so the stream is sorted by time below.
const steps: NewEvent[][] = [
  // Step 1. frame_problem: Sam (ux), assist, 2026-09-02 to 2026-09-10.
  [
    move("invented-101", PO, at("09-01", "09:00"), "backlog", "ready"),
    ...pick("invented-101", UX, at("09-02", "08:30"), "assist"),
    ...ask(
      "invented-101",
      at("09-02", "09:00"),
      "invented-q101a",
      UX,
      "Invented: whose problem is this? \"Booked slots go unused and the caretaker is flooded with calls\" is the board's. The third business goal, residents can wash when they need to, has no line in it.",
      "Invented: the problem statement and the success criteria have to cover the residents' goal too, or the framing describes only one stakeholder.",
    ),
    ...answer(
      "invented-101",
      UX,
      at("09-02", "13:00"),
      "invented-q101a",
      "Invented: it is the board's. Residents cannot see whether a machine works or a fault is already reported, so they call again, and slots go unused when the machine turns out broken. I am rewriting the problem around that.",
    ),
    ...ask(
      "invented-101",
      at("09-02", "14:00"),
      "invented-q101b",
      UX,
      "Invented: who actually decides, and who can block? What was tried before and failed? Is the 2027-03-01 deadline fixed?",
      "Invented: these are the tacit items of frame_problem; the non-goals and client questions depend on them.",
    ),
    ...answer(
      "invented-101",
      UX,
      at("09-03", "08:00"),
      "invented-q101b",
      "Invented: Morgan signs, but Kim's laundry group can block anything at the annual meeting, as it blocked a coin-operated booking panel in 2019. The board wants fault reports through the service only and, said in the kick-off, a two-week booking ban after three unused slots; Kim opposes both. The deadline is fixed in Morgan's eyes, but the meeting could move a week.",
    ),
    check(
      "invented-101",
      AI,
      at("09-03", "10:00"),
      "structural",
      false,
      "Invented: criteria_measurable failed: \"Repeat calls about the same machine fault\" has no baseline number. The draft goes back to Sam, who asks Lee to tally his call notebook for 2026-08-03 to 2026-08-30.",
    ),
    report(
      "invented-101",
      UX,
      at("09-07", "09:00"),
      "Invented: Lee's tally: 31 fault calls about 9 faults, 22 of them about a fault already reported, so 71%. Target 20% by 2027-06-30.",
    ),
    check("invented-101", AI, at("09-07", "09:30"), "structural", true, "Invented: every criterion has a baseline, a target and a date."),
    check(
      "invented-101",
      AI,
      at("09-07", "09:35"),
      "consistency",
      false,
      "Invented: no_contradictions: the non-goal \"Closing the phone line\" contradicts the brief's \"fault reports through the new service only\".",
    ),
    check(
      "invented-101",
      AI,
      at("09-07", "11:00"),
      "consistency",
      true,
      "Invented: no_contradictions passes: the non-goal stays, and a client question asks the board to accept phone reports that the caretaker enters.",
    ),
    move("invented-101", UX, at("09-07", "11:05"), "in_progress", "review"),
    check("invented-101", UX, at("09-08", "15:00"), "human", true, "Invented: Sam approved the framing in the tool."),
    report(
      "invented-101",
      UX,
      at("09-10", "16:00"),
      "Invented: stakeholder meeting: Morgan accepts that the phone line stays if Lee enters phone reports himself, and moves booking bans to the board meeting on 2026-10-14. Kim agrees to the criteria. Approved with changes. Proposal to stakeholder_context accepted.",
    ),
    move("invented-101", UX, at("09-10", "16:05"), "review", "done"),
    report(
      "invented-101",
      PO,
      at("09-11", "09:00"),
      "Invented: proposal to constraints accepted: 2027-03-01 is fixed for a demonstration, not for the full service.",
    ),
  ],

  // Step 2, write_handoff_spec, is outside the segment and has no card: Sam
  // wrote ui_spec and acceptance_criteria by hand on 2026-09-11 to 09-15.

  // Step 3. write_issues: Robin (po) with the team, delegate, 2026-09-16 to 2026-09-17.
  [
    move("invented-102", PO, at("09-15", "09:00"), "backlog", "ready"),
    ...pick("invented-102", PO, at("09-16", "09:00"), "delegate"),
    report(
      "invented-102",
      PO,
      at("09-16", "09:05"),
      "Invented: slice by resident flow: book, report a fault, see machine status. The caretaker's side is out of this round.",
    ),
    report("invented-102", AI, at("09-16", "11:00"), "Invented: drafted seven issues, a coverage table for AC-1 to AC-9 and a suggested order."),
    check(
      "invented-102",
      AI,
      at("09-16", "11:05"),
      "structural",
      false,
      "Invented: size_within_convention: \"Booking calendar with week view, rebooking and reminders\" is L, and team_conventions allow at most M. Split into I-1 Book a slot (M), I-2 See and cancel my bookings (S) and I-3 Booking reminders (S).",
    ),
    check("invented-102", AI, at("09-16", "11:30"), "structural", true, "Invented: every issue is within M and names one role."),
    check(
      "invented-102",
      AI,
      at("09-16", "11:35"),
      "consistency",
      false,
      "Invented: no_non_goal_work: \"Send a booking-ban notice after three unused slots\" is work on the non-goal on booking bans.",
    ),
    report("invented-102", PO, at("09-16", "14:00"), "Invented: dropped the booking-ban notice."),
    check("invented-102", AI, at("09-16", "14:05"), "consistency", true, "Invented: no issue works on a non-goal."),
    move("invented-102", PO, at("09-16", "14:10"), "in_progress", "review"),
    report(
      "invented-102",
      BE,
      at("09-17", "10:00"),
      "Invented: fault status lives in Lee's notebook and a spreadsheet on his own laptop. No system holds it.",
    ),
    check(
      "invented-102",
      PO,
      at("09-17", "10:30"),
      "human",
      true,
      "Invented: the team approved I-1 to I-7 and their order. I-6 and I-7 are the booking and fault-status contracts.",
    ),
    report(
      "invented-102",
      PO,
      at("09-17", "10:35"),
      "Invented: proposal to constraints accepted: fault status depends on the caretaker's records, which no system holds.",
    ),
    move("invented-102", PO, at("09-17", "10:40"), "review", "done"),
  ],

  // The product owner orders the next cards.
  [
    move("invented-103", PO, at("09-18", "09:00"), "backlog", "ready"),
    move("invented-104", PO, at("09-18", "09:01"), "backlog", "ready"),
    move("invented-105", PO, at("09-18", "09:02"), "backlog", "ready"),
  ],

  // Step 4. refine_ui_spec for I-1 and I-2: Alex (fe), assist, 2026-09-21 to 2026-09-24.
  [
    ...pick("invented-103", FE, at("09-21", "08:30"), "assist"),
    check("invented-103", AI, at("09-21", "09:30"), "structural", false, "Invented: states_complete: My bookings has no empty state."),
    ...ask(
      "invented-103",
      at("09-21", "10:00"),
      "invented-q103",
      FE,
      "Invented: data_needed lists \"apartment number of the holder\" on Book a slot. Where does it come from, and who is allowed to see it?",
      "Invented: the screen shows one resident's data to the others, and the source alone does not say whether that is allowed.",
    ),
    ...answer(
      "invented-103",
      FE,
      at("09-21", "15:00"),
      "invented-q103",
      "Invented: Robin says the cooperative's 2025 privacy rule forbids showing a resident's name or apartment number to other residents in any digital service. Taken slots show only \"Booked\", and residents see which slots are their own. Logged under decisions; a design question to Sam on swapping; a proposal to constraints written.",
    ),
    report("invented-103", FE, at("09-23", "11:00"), "Invented: Sam answered the design question: swapping slots is not in this version."),
    check("invented-103", AI, at("09-23", "11:30"), "structural", true, "Invented: every screen lists its states, and all data is named with its source."),
    check(
      "invented-103",
      AI,
      at("09-23", "11:35"),
      "consistency",
      true,
      "Invented: no_silent_change: the change from the UI spec is listed under decisions.",
    ),
    move("invented-103", FE, at("09-23", "11:40"), "in_progress", "review"),
    check("invented-103", FE, at("09-24", "10:00"), "human", true, "Invented: Alex approved; no design question blocks the build."),
    report(
      "invented-103",
      PO,
      at("09-24", "10:30"),
      "Invented: proposal to constraints accepted, three days after it was written: no other resident's name or apartment number is shown in any view.",
    ),
    move("invented-103", FE, at("09-24", "10:35"), "review", "done"),
  ],

  // Step 5. define_api_contract for I-6, booking: Pat (be), delegate, 2026-09-22 to 2026-09-24.
  [
    ...pick("invented-104", BE, at("09-22", "08:30"), "delegate"),
    report(
      "invented-104",
      BE,
      at("09-22", "08:35"),
      "Invented: slots are computed from opening hours per machine group, not stored; a booking holds one slot, and a resident holds at most two future bookings.",
    ),
    ...ask(
      "invented-104",
      at("09-22", "09:30"),
      "invented-q104",
      BE,
      "Invented: two slot models: computed on request from the opening hours, or slot rows generated for twelve weeks ahead. Which one?",
      "Invented: it decides the shape of GET /slots and how a change in opening hours reaches residents.",
    ),
    ...answer("invented-104", BE, at("09-22", "11:00"), "invented-q104", "Invented: computed, because opening hours change when the board says so."),
    report("invented-104", AI, at("09-22", "15:00"), "Invented: drafted the OpenAPI file with examples and two contract questions."),
    check("invented-104", AI, at("09-22", "15:05"), "structural", true, "Invented: the contract is valid OpenAPI 3.1 with errors, auth and examples on every endpoint."),
    check(
      "invented-104",
      AI,
      at("09-22", "15:10"),
      "consistency",
      true,
      "Invented: rules_respected: a third future booking is answered with 409 and a reason.",
    ),
    move("invented-104", BE, at("09-22", "15:30"), "in_progress", "review"),
    check(
      "invented-104",
      FE,
      at("09-23", "14:00"),
      "human",
      false,
      "Invented: contract review: each taken slot in GET /slots carries bookedBy with the holder's apartment number, which breaks the privacy rule proposed on 2026-09-21. Sent back.",
    ),
    move("invented-104", BE, at("09-23", "14:05"), "review", "in_progress"),
    report("invented-104", BE, at("09-23", "16:00"), "Invented: replaced bookedBy with mine: true or false."),
    move("invented-104", BE, at("09-23", "16:05"), "in_progress", "review"),
    check(
      "invented-104",
      BE,
      at("09-24", "11:00"),
      "human",
      true,
      "Invented: Pat and Alex signed off after Robin accepted the privacy proposal. Booking bans are not in the contract, pending the board.",
    ),
    move("invented-104", BE, at("09-24", "11:05"), "review", "done"),
  ],

  // Step 6. refine_ui_spec for I-4 and I-5, faults: Alex (fe), manual, 2026-09-25 to 2026-09-28.
  [
    ...pick("invented-105", FE, at("09-25", "08:30"), "manual"),
    report(
      "invented-105",
      FE,
      at("09-27", "16:00"),
      "Invented: wrote the refined spec for Report a fault and Machine status, and asked the AI to run the checks.",
    ),
    check(
      "invented-105",
      AI,
      at("09-27", "16:10"),
      "structural",
      false,
      "Invented: data_named: \"fault progress (reported, repair booked, fixed)\" on Machine status has no source.",
    ),
    report(
      "invented-105",
      FE,
      at("09-27", "16:40"),
      "Invented: source named: the caretaker's fault records; no system holds them yet (see constraints).",
    ),
    check("invented-105", AI, at("09-27", "16:45"), "structural", true, "Invented: all data is named with a source."),
    report(
      "invented-105",
      FE,
      at("09-28", "10:00"),
      "Invented: Sam answered: a fault reported by phone looks the same once Lee has entered it, without the reporter's name.",
    ),
    move("invented-105", FE, at("09-28", "10:05"), "in_progress", "review"),
    check("invented-105", FE, at("09-28", "10:30"), "human", true, "Invented: Alex approved; no design question blocks the build."),
    move("invented-105", FE, at("09-28", "10:35"), "review", "done"),
  ],

  // Step 7. define_api_contract for I-7, fault status: Pat (be), assist, from 2026-09-29.
  // The snapshot ends before Lee's reply on 2026-10-07.
  [
    move("invented-106", PO, at("09-28", "12:00"), "backlog", "ready"),
    ...pick("invented-106", BE, at("09-29", "08:30"), "assist"),
    report(
      "invented-106",
      AI,
      at("09-29", "09:00"),
      "Invented: data_needed for Machine status names a source that no system holds, and constraints says so too.",
    ),
    ...ask(
      "invented-106",
      at("09-29", "11:00"),
      "invented-q106",
      PO,
      "Invented: which source does the fault-status endpoint read, and what format are the caretaker's fault records in? Pat cannot say; only Lee can, and Lee is not on the team, so this goes to him through Robin.",
      "Invented: without a source the API can read, no endpoint can serve machine state or fault progress.",
    ),
    move("invented-107", PO, at("09-29", "14:00"), "backlog", "ready"),
    move("invented-107", PO, at("09-30", "09:00"), "ready", "in_progress"),
    report("invented-107", PO, at("09-30", "09:05"), "Invented: asked Lee what his fault records hold and whether he would keep them in a shared form."),
    move("invented-108", PO, at("10-05", "09:00"), "backlog", "ready"),
  ],
];

let n = 0;
/** The events in time order, each with the next invented id. */
const events: CardEvent[] = steps
  .flat()
  .map((event, index) => ({ event, index }))
  .sort((a, b) => Date.parse(a.event.at) - Date.parse(b.event.at) || a.index - b.index)
  .map(({ event }) => {
    n += 1;
    return { ...event, id: `invented-e${String(n).padStart(3, "0")}` } as CardEvent;
  });

export const inventedSeed: SeedData = {
  teammates: [
    { kind: "human", id: PO, name: "Robin Example (invented product owner)", role: "po", process_profile: { write_issues: "delegate" } },
    { kind: "human", id: UX, name: "Sam Example (invented UX designer)", role: "ux", process_profile: { frame_problem: "assist" } },
    { kind: "human", id: FE, name: "Alex Example (invented frontend developer)", role: "fe", process_profile: { refine_ui_spec: "assist" } },
    { kind: "human", id: BE, name: "Pat Example (invented backend developer)", role: "be", process_profile: { define_api_contract: "assist" } },
    { kind: "ai", id: AI, name: "AI teammate (invented)" },
  ],

  cycles: [
    { id: "invented-sprint-1", name: "Sprint 1 (invented)", starts_at: "2026-08-31T06:00:00Z", ends_at: "2026-09-14T06:00:00Z" },
    { id: "invented-sprint-2", name: "Sprint 2 (invented)", starts_at: "2026-09-14T06:00:00Z", ends_at: "2026-09-28T06:00:00Z" },
    { id: "invented-sprint-3", name: "Sprint 3 (invented)", starts_at: "2026-09-28T06:00:00Z", ends_at: "2026-10-12T06:00:00Z" },
  ],

  cards: [
    { id: "invented-101", title: "Invented: frame the laundry room problem", function_id: "frame_problem", owner: UX, milestone, links: [] },
    {
      id: "invented-102",
      title: "Invented: write issues for booking, fault reports and machine status",
      function_id: "write_issues",
      owner: PO,
      milestone,
      links: [],
    },
    { id: "invented-103", title: "Invented: refine the booking screens for I-1 and I-2", function_id: "refine_ui_spec", owner: FE, milestone, links: [] },
    { id: "invented-104", title: "Invented: define the booking contract for I-6", function_id: "define_api_contract", owner: BE, milestone, links: [] },
    { id: "invented-105", title: "Invented: refine the fault screens for I-4 and I-5", function_id: "refine_ui_spec", owner: FE, milestone, links: [] },
    {
      id: "invented-106",
      title: "Invented: define the fault-status contract for I-7",
      function_id: "define_api_contract",
      owner: BE,
      milestone,
      links: [{ relation: "depends_on", card_id: "invented-107" }],
    },
    {
      id: "invented-107",
      title: "Invented: I-8, get the caretaker's fault records into a form the API can read",
      function_id: "write_issues",
      owner: PO,
      milestone,
      links: [],
    },
    { id: "invented-108", title: "Invented: refine the booking reminder screens for I-3", function_id: "refine_ui_spec", owner: FE, milestone, links: [] },
  ],

  events,
};
