// The seam between the AI teammate runner and whatever produces its work.
// The runner decides which card the AI may take and which events it may
// append; a provider only says what the AI found and what it needs to ask.
// The stub in ./stubProvider.ts is deterministic and is what the tests and the
// demo use. A Claude provider plugs in here later by implementing the same
// interface (see docs/decisions.md, 2026-11-08, "AI teammate").
import type { Card, CardEvent, FunctionFrontMatter, Mode, Protocol, Teammate } from "@workbench/shared";

/** Everything a provider sees about one step of work. All of it is read, never invented by the runner. */
export interface WorkContext {
  card: Card;
  /** The card's function definition, read from process/functions. */
  definition: FunctionFrontMatter;
  /** The mode the AI works in: the owner's choice for this function, else the function's default. */
  mode: Mode;
  /** `definition.protocols[mode]`: who opens, asks, writes and decides. */
  protocol: Protocol;
  /**
   * The card log so far, oldest first. The runner calls the provider before it
   * appends the pick, so a failing provider leaves the card untouched.
   */
  log: CardEvent[];
  /** The card's owner. Always human, because the owner's profile sets the mode. */
  owner: Extract<Teammate, { kind: "human" }>;
  /** The AI teammate doing the work. */
  self: Extract<Teammate, { kind: "ai" }>;
  /** Every teammate on the board, for providers that ask someone other than the owner. */
  teammates: Teammate[];
}

/** A question the AI raises on the card. The card then waits on `asked_of`. */
export interface RaisedQuestion {
  /** A human teammate: in every protocol `decides` is human. */
  asked_of: string;
  text: string;
  why_it_blocks: string;
}

/** One step of AI work on a card. */
export interface WorkStep {
  /** What the AI did or found, posted to the card log as a report. */
  note: string;
  /** The question that blocks the work. The runner moves the card to Needs input on it. */
  question: RaisedQuestion;
}

export interface TeammateProvider {
  /** A short name for logs and decisions, e.g. "stub" or "claude:claude-opus-5-5". */
  readonly name: string;
  work(context: WorkContext): Promise<WorkStep>;
}
