# Workbook: new team members working with the team

Written 2026-11-17 by Claude, after Felix Svensson (fe) and Uxi Larsson (ux) were added to the workbench board on the team screen. The workbook walks through one card from creation to review, and says at each step what to do, what the board should show, and what is real and what is played.

Felix and Uxi now live only on the rehearsal board. On 2026-11-17, after a first rehearsal, Mikael decided to take them off the real board for now and hold every role there himself again, so the real board's team is Mikael (po, ux, fe, be) and the AI teammate. Run every step below on the rehearsal board (the section "Rehearsal board" says how): every address below is the rehearsal board's, on ports 3001 and 5174. The rehearsal also showed which steps could only be done with curl; creating a card, asking a question on a card and taking a person off the team now have their place in the UI, and the steps say where.

## What to aim for

The goal is to see the two new people take part in the chain: a card owned by Felix moves through the board, the AI teammate works on it in the way Felix's mode allows, and Felix and Uxi wait on each other through questions on the card. If the board shows each of those as events, under the right person, without a reload, then adding a person works end to end.

The goal is not to see Felix and Uxi act by themselves. That is the first thing to understand before starting.

## Who acts, and who is played

Felix and Uxi are people in the model. The workbench never acts for a person, and nothing in the app or in Claude Code runs them as agents or subagents. There is also no sign-in yet, so whatever Felix or Uxi "does" is something you do while the app records it as them: on the card screen the actor is the card's owner, on the team screen it is the person chosen under "Changing as", and with curl it is the `actor` you write in the request.

The only teammate that acts on its own is `ai`. It can be driven in three ways, and they behave quite differently:

1. **The stub run**, `POST /api/teammates/ai/run`. This calls no model and writes no code. It picks the first Ready card whose owner works it in `assist`, writes an invented note, and asks the owner an invented question about the function's tacit knowledge, so the card moves to Needs input. After you answer, the card goes to In progress and the stub does nothing more with it; a second run answers 409 if no other card qualifies. It exists to show the board moving, and is safe on any board.
2. **A Claude Code session in this repository**, through the `workbench` MCP server (`.mcp.json`). You prompt here as usual, for example "pick card #23 on the workbench board and work it". The session then is the AI teammate: it reads the card with `get_card`, picks it with `pick_card` in the owner's mode, works on the branch `link_branch` names, asks the owner with `ask_question` when only a person can settle something and waits with `wait_for_answer`, and posts a report with `post_report`. It can pick cards in `assist` or `delegate`. This is real work: on the `teams/workbench` board a card is a task on this repository, so the session writes real code on a real branch. It stops before pushing or opening a pull request and asks for your go-ahead.
3. **A batch with `/work-batch`.** On the board you select two or more Ready cards of one owner and hand them to the AI; then you type `/work-batch` here. The session plans the cards into waves and works each wave with one worktree subagent per card. The subagents are the AI working one card each, not Felix or Uxi.

So the answer to "do I prompt here and then the team members start working" is: you prompt here, and the AI teammate starts working, on Felix's card and within Felix's mode. Felix's and Uxi's parts, picking, answering, approving, are yours to play.

## What the modes mean for this run

A mode is set per person and per step, on the person's profile, and decides who opens, asks, writes and decides (`process/template.md`). Two matter here:

- `assist`: the person drives and writes; the AI asks and challenges. The stub run picks only `assist` cards, so this is the mode that shows the AI picking a card by itself.
- `delegate`: the AI drafts and the person edits and verifies. The AI takes such a card only when a person hands it over, in a session or a batch. This is the mode that shows the AI writing code.

In both, a person must have moved the card to Ready first, and a person decides. The suggested setup is Felix in `assist` for `implement_interactions` (it is the function's default) and in `delegate` for `refine_ui_spec`, and Uxi left as is. Uxi's only own step is `frame_problem`, so Uxi's part in this run is to be asked.

## Before you start

Start the rehearsal board as the section "Rehearsal board" says, and open it at http://localhost:5174 and its team screen at `#/team`; Felix and Uxi should both be there with their roles.

Titles can be anything on the rehearsal board, since its board is thrown away when you start over. A session that works a card still writes code in this repository, so stop it before it commits, or delete its branch afterwards.

## Step 1: give Felix a card

On the board, use "New card" at the head of the Backlog column. Choose yourself under "Creating as", write the title, choose `implement_interactions` as the function and Felix as owner (he is offered by default, as the one person seated in the function's role), and press "Create card". The form says which number the card got and links to it. The same can be done with curl, as yourself (the PO), with Felix as owner:

```sh
curl -s localhost:3001/api/cards -H 'content-type: application/json' \
  -d '{"actor":"mikael","owner":"felix-svensson","function_id":"implement_interactions","title":"<a small real task>"}'
```

**Expect:** the response carries the card's number (call it `<n>`; it is the next plain number). The card appears in Backlog, live, and the FE seat on the board is Felix's. The card log at `#/cards/<n>` shows one creation event by Mikael. No agent starts: creating a card does nothing else.

## Step 2: Felix makes the card ready

Open `#/cards/<n>` and use "Move to Ready". The move is recorded as Felix, because he owns the card.

**Expect:** the card moves to Ready on the board, and its log shows the move by Felix. This matters for the next step: under both modes `opens` is `human`, and the AI is refused a card that no person moved to Ready.

## Step 3: the AI picks it, in one of two ways

**3a, the stub, with Felix in `assist`.** Run:

```sh
curl -s -X POST localhost:3001/api/teammates/ai/run
```

**Expect:** the card moves to In progress and then Needs input, the AI's panel shows what it did, and the card shows an invented question asked of Felix. The run takes the first Ready card it may pick, so card A should be the only `assist` card in Ready.

**3b, a session, with Felix in `delegate`.** Set Felix's `implement_interactions` to `delegate` on `#/teammates/felix-svensson` (or create the card for `refine_ui_spec`), then prompt here: "Pick card #<n> on the workbench board and work it." 

**Expect:** the session reads the card, picks it in `delegate`, and the card moves to In progress under the AI. Because `delegate` asks for a first move from the person, a good session asks Felix for his intent before writing; the card then waits on Felix. When it has worked, it reports its branch (`wb/<n>-…`), commits and the result of `pnpm check`, and stops before pushing.

## Step 4: answer as Felix

On `#/cards/<n>`, answer the open question. Any person may record an answer; the decider is the person you answer as.

**Expect:** the card goes back to In progress and the log shows both the question and the answer. In 3b, the waiting session picks up the answer through `wait_for_answer` and carries on by itself.

## Step 5: Felix asks Uxi

This is the step that shows two people working through the board. With the card In progress and no open question, the card screen shows "Ask a question". Choose Felix under "Asking as" and Uxi under "Ask whom", write the question ("Which empty state do we show?") and why it blocks ("The screen has no design for zero bookings"), and press "Ask". The same with curl:

```sh
curl -s localhost:3001/api/cards/<n>/questions -H 'content-type: application/json' \
  -d '{"actor":"felix-svensson","asked_of":"uxi-larsson","text":"Which empty state do we show?","why_it_blocks":"The screen has no design for zero bookings"}'
```

**Expect:** the card moves to Needs input and Uxi's panel shows it as waiting on Uxi. Answer it on the card screen; the card returns to In progress and the log shows both. Nothing contacts Uxi: there are no notifications, so the board is the only place the question lives.

## Step 6: review and done (session only, real board only)

No GitHub event reaches the rehearsal API, so on the rehearsal board stop at the session's report. On the real board, with your go-ahead, the session pushes the branch and opens the pull request as the App, and the webhook moves the card to Review. A person's approval on the head commit and the merge move it to Done.

**Expect a limit here:** only `muxare` maps to a person in `teams/workbench/team.json`, so every review that reaches the board from GitHub is Mikael's. A person cannot approve a pull request until they have a GitHub login in `github_logins`, and a login that maps to a person who left the team is ignored.

## What counts as success

The run has worked when the card's log at `#/cards/<n>` reads, in order: created by Mikael, moved to Ready by Felix, picked by the AI in Felix's mode, a question to Felix and his answer, a question from Felix to Uxi and Uxi's answer; and the board showed each change without a reload. Anything else is worth writing down: a move refused with a reason you did not expect, a panel that shows the card under the wrong person, or a step that needed a reload.

## Rehearsal board

The real board keeps every card and event for good, and since 2026-11-17 Felix and Uxi are only here, so the run happens on a board of its own. `teams/rehearsal/team.json` is a team with Mikael (po, be), Felix (fe), Uxi (ux) and the AI teammate. Its board, `teams/rehearsal/board.db`, is git-ignored like every team's board, and it runs beside the real one on other ports: the API on 3001 and the web board on 5174. The real board on 3000 and 5173 is not touched. `pnpm wb` only manages the real board, so the rehearsal runs in terminals you keep open.

Open four terminals, each in the repository root (`cd ~/source/repos/workbench`).

**Terminal 1, the rehearsal API.** Create the board the first time, then serve it, and leave it running:

```sh
pnpm --filter @workbench/api team:start teams/rehearsal   # first time only
PORT=3001 pnpm --filter @workbench/api team:serve teams/rehearsal
```

To have the AI pick an `assist` card by itself a few seconds after it reaches Ready, without the curl of cheat-sheet step 4, serve it with the timer instead: `TEAMMATE_INTERVAL_MS=5000 PORT=3001 pnpm --filter @workbench/api team:serve teams/rehearsal`.

**Terminal 2, the rehearsal web board.** Leave it running, and open http://localhost:5174 in the browser:

```sh
API_URL=http://localhost:3001 pnpm --filter @workbench/web dev --port 5174 --strictPort
```

**Terminal 3, the curl commands.** Most steps now have a place in the UI; the curl lines of the cheat sheet are the alternative, and if you use them, run them all here, in this one terminal, so that `$A` and `$B` keep the card numbers. Start it with:

```sh
API=localhost:3001/api
```

**Terminal 4, the AI session.** Start a separate Claude Code session whose MCP server talks to the rehearsal API, and use it for step 8 only:

```sh
WORKBENCH_API_URL=http://localhost:3001 claude
```

The code that session writes still lands in this repository, so stop it before it commits, or delete its `wb/<n>-…` branch afterwards. No GitHub event reaches the rehearsal API, so opening a pull request would not move the card; stop at the session's report.

**To start over,** stop terminal 1 with Ctrl-C, then run `rm teams/rehearsal/board.db*` and the two commands of terminal 1 again. The new board has no cards, and card numbers start at 1 again. Terminal 2 can keep running.

**When done,** stop terminals 1 and 2 with Ctrl-C and close the session in terminal 4.

## Cheat sheet

The whole run in order, on the rehearsal board. Each step says where it is done in the browser at http://localhost:5174, and the curl line that does the same in terminal 3, if you prefer it.

```sh
# Terminal 3, only for the curl alternatives.
API=localhost:3001/api
J='content-type: application/json'
```

1. **Felix's modes.** On `#/teammates/felix-svensson`, set `implement_interactions` to `assist` and `refine_ui_spec` to `delegate`.

```sh
curl -s $API/teammates/felix-svensson/modes -H "$J" -d '{"actor":"felix-svensson","function_id":"implement_interactions","mode":"assist"}'
curl -s $API/teammates/felix-svensson/modes -H "$J" -d '{"actor":"felix-svensson","function_id":"refine_ui_spec","mode":"delegate"}'
```

2. **Two cards for Felix, created by Mikael.** On the board, "New card" at the head of Backlog: "Creating as" Mikael, owner Felix, one card for `implement_interactions` (card A) and one for `refine_ui_spec` (card B). The form says each card's number.

```sh
A=$(curl -s $API/cards -H "$J" -d '{"actor":"mikael","owner":"felix-svensson","function_id":"implement_interactions","title":"<task A>"}' | jq -r .card.id)
B=$(curl -s $API/cards -H "$J" -d '{"actor":"mikael","owner":"felix-svensson","function_id":"refine_ui_spec","title":"<task B>"}' | jq -r .card.id)
echo "A=#$A B=#$B"
```

3. **As Felix:** open card A and card B (`#/cards/<n>`) and click "Move to Ready" on each.
4. **The AI picks card A by itself** (the stub, no model call). With the timer from terminal 1 this happens on its own; without it:

```sh
curl -s -X POST $API/teammates/ai/run
```

5. **As Felix:** on card A, answer the AI's question.
6. **Felix asks Uxi on card A.** On card A, "Ask a question": "Asking as" Felix, "Ask whom" Uxi.

```sh
curl -s $API/cards/$A/questions -H "$J" -d '{"actor":"felix-svensson","asked_of":"uxi-larsson","text":"Which empty state do we show?","why_it_blocks":"The screen has no design for zero bookings"}'
```

7. **As Uxi:** on card A, answer the question.
8. **Terminal 4:** prompt "Pick card #<B> on the workbench board and work it."
9. **As Felix:** on card B, answer the session's question when it comes.
10. **When the session reports,** stop there, and delete its `wb/<B>-…` branch if it committed.
