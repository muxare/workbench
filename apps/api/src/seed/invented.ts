// INVENTED EXAMPLE DATA. Every teammate, card, question and event below is made
// up for developing and demonstrating the workbench; none of it describes a
// real client, cooperative, project or person. It is the laundry room project
// in examples/laundry-room/: the team and cast from its README, and the log
// from history.md, the answer key.
//
// The board is a snapshot at the end of 2026-10-06, in step 7 of the history:
// the fault-status contract (#106) waits on the product owner, who has passed
// the AI's question to the caretaker, and I-8 (#107), which #106 depends on, is
// in progress. Three things go beyond the history:
// - A running cycle, Sprint 4, set relative to when the seed runs
//   (`runningCycle`), so the cycle log under the board holds the events made
//   live in a demo. Sprints 1 to 3 are the history's dates and have ended.
// - #108, refining the booking reminder screens for I-3, is moved to Ready
//   early in Sprint 4, so the AI teammate has a card to pick and the running
//   cycle's log is not empty. The history does not say when I-3 was refined.
// - #107 is a `write_issues` card. I-8 is work for the product owner and the
//   caretaker that no function in process/ describes, but every card needs a
//   function, and #106 needs a card to depend on.
// A card's links have no events, so #106 depends on #107 from the start,
// although the history adds the link only after #106 was picked on 2026-09-29.
// Each person's modes are `mode_changed` events, as in the app: everyone sets
// the mode of their first step on 2026-09-01, Alex switches refine_ui_spec to
// manual for #105 and back to assist when it is done, and Pat switches
// define_api_contract from delegate (#104) to assist before picking #106. The
// history gives the mode of each step; when exactly each change was made is
// invented, placed just before the pick that needs it.
//
// The seed is a function of the time it runs (`inventedSeedAt`); the CLI
// passes the clock, tests pass a fixed time.
//
// This is the only module that holds seed data. A real project (the Phase 2
// run, see docs/decisions.md, 2026-11-08) replaces it by exporting another
// `SeedData`; nothing else needs to change. Function ids must be names of
// files in process/functions; `seed()` checks them against process/.
import type { CardStatus, Cycle, Mode, StreamEvent } from "@workbench/shared";
import type { SeedData } from "../store.ts";

const PO = "invented-po";
const UX = "invented-ux";
const FE = "invented-fe";
const BE = "invented-be";
const AI = "invented-ai";

const milestone = "Laundry room service, first version (invented)";

/** An event without its id, one variant at a time. */
type NewEvent = StreamEvent extends infer E ? (E extends StreamEvent ? Omit<E, "id"> : never) : never;

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

/** A person sets the mode they work a function in; `from` is null when they had not chosen one. */
function setMode(person: string, when: string, function_id: string, from: Mode | null, to: Mode): NewEvent {
  return { type: "mode_changed", teammate_id: person, actor: person, at: when, function_id, from, to };
}

// The history, step by step. Each step's events are in order; the steps
// overlap in time, so the stream is sorted by time below.
const steps: NewEvent[][] = [
  // Before step 1, everyone sets the mode of the first step they own.
  [
    setMode(PO, at("09-01", "08:00"), "write_issues", null, "delegate"),
    setMode(UX, at("09-01", "08:00"), "frame_problem", null, "assist"),
    setMode(FE, at("09-01", "08:00"), "refine_ui_spec", null, "assist"),
    setMode(BE, at("09-01", "08:00"), "define_api_contract", null, "delegate"),
  ],
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
    setMode(FE, at("09-25", "08:00"), "refine_ui_spec", "assist", "manual"),
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
    setMode(FE, at("09-28", "10:40"), "refine_ui_spec", "manual", "assist"),
  ],

  // Step 7. define_api_contract for I-7, fault status: Pat (be), assist, from 2026-09-29.
  // The snapshot ends before Lee's reply on 2026-10-07.
  [
    move("invented-106", PO, at("09-28", "12:00"), "backlog", "ready"),
    setMode(BE, at("09-29", "08:00"), "define_api_contract", "delegate", "assist"),
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
  ],
];

/** The events in time order, each with the next invented id. */
function numbered(all: NewEvent[]): StreamEvent[] {
  return all
    .map((event, index) => ({ event, index }))
    .sort((a, b) => Date.parse(a.event.at) - Date.parse(b.event.at) || a.index - b.index)
    .map(({ event }, i) => ({ ...event, id: `invented-e${String(i + 1).padStart(3, "0")}` }) as StreamEvent);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** The end of Sprint 3, the last cycle of the history; Sprint 4 never starts before it. */
const HISTORY_ENDS = Date.parse("2026-10-12T06:00:00Z");

/**
 * Sprint 4: two weeks starting at 06:00 UTC two days before `seededAt`, and
 * never before Sprint 3 ends. Seeded on any day from 2026-11-07 to
 * 2026-11-18, the window holds ConCon on 2026-11-18 and the days in between.
 */
export function runningCycle(seededAt: Date): Cycle {
  const day = new Date(seededAt.getTime() - 2 * DAY_MS);
  const start = Math.max(HISTORY_ENDS, Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 6));
  return {
    id: "invented-sprint-4",
    name: "Sprint 4 (invented)",
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + 14 * DAY_MS).toISOString(),
  };
}

/**
 * The invented seed as it is loaded at `seededAt`: the history's log up to
 * 2026-10-06, then #108 moved to Ready three hours into the running Sprint 4
 * (or at `seededAt`, if that is sooner), so that move is in the past and in
 * the window.
 */
export function inventedSeedAt(seededAt: Date): SeedData {
  const sprint4 = runningCycle(seededAt);
  const readyAt = Math.min(Date.parse(sprint4.starts_at) + 3 * 60 * 60 * 1000, Math.max(seededAt.getTime(), Date.parse(sprint4.starts_at)));
  const i3Ready = move("invented-108", PO, new Date(readyAt).toISOString(), "backlog", "ready");
  return { ...base, cycles: [...base.cycles, sprint4], events: numbered([named, ...steps.flat(), i3Ready]) };
}

/**
 * The team is named when it joins. The headline keeps the title the ConCon
 * demo was shown with; the board shows it in place of the team's name.
 */
const named: NewEvent = {
  type: "team_named",
  actor: PO,
  at: "2026-08-31T06:00:00Z",
  from: null,
  to: { name: "Laundry room team (invented)", headline: "AI joins the team at the board" },
};

const base: Omit<SeedData, "events"> = {
  teammates: [
    { kind: "human", id: PO, name: "Robin Example (invented product owner)", roles: ["po"] },
    { kind: "human", id: UX, name: "Sam Example (invented UX designer)", roles: ["ux"] },
    { kind: "human", id: FE, name: "Alex Example (invented frontend developer)", roles: ["fe"] },
    { kind: "human", id: BE, name: "Pat Example (invented backend developer)", roles: ["be"] },
    { kind: "ai", id: AI, name: "AI teammate (invented)" },
  ],
  // The team joins when Sprint 1 starts, before anyone sets a mode.
  joined_at: "2026-08-31T06:00:00Z",

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
};
