# Demo script: ConCon, 2026-11-18

Written on 2026-11-09 and dry-run end to end the same day against a fresh scratch database (API on port 3100, Vite on 5180, Chrome). Updated the same day for the cycle log panel and the running Sprint 4, and dry-run again end to end against a fresh scratch database (API on port 3200, Vite on 5190, Chrome, no console errors). Every command and click below is the one that was run; where the dry run showed something worth knowing, it is said at the step.

The talk is about how AI and people collaborate; the app is the example. Three points carry the demo, and every step below serves at least one of them:

- **A person decides.** The AI works in the mode each person chose for each step, it never answers its own question, and it never moves a card past Needs input.
- **The AI asks rather than guesses.** When the AI meets tacit knowledge, it stops and asks the person who has it, and the card waits on that person where the whole team can see it.
- **Every change to how the team works is an event.** Answers, mode changes and log filters are all events in one stream, so the logs show who changed what and when, and every screen updates live.

Since 2026-11-14 the demo has two parts. Part 1, below, works real cards on the workbench's own board, where Mikael chooses on stage which work he does himself and which the AI does; nothing in it is planted, so a failed check or a question appears only if the work produces one. Part 2 is the invented script that follows it, kept for the points Part 1 may not reach on the day (the AI asking, a relayed question, the log filter) and as the fallback if the network or GitHub fails. In Part 2 all data is the invented laundry room project (`examples/laundry-room/`, seeded from `apps/api/src/seed/invented.ts`). Say so on stage: no teammate, card or question describes a real client or person.

## Part 1: real cards on the workbench's own board

Planned on 2026-11-14 and not yet dry-run. It needs card #15 built first, so that a person can move a card to Ready and pick it on screen; until then those two steps are API calls, shown below. Set the modes, including Mikael's `delegate` for `implement_interactions` from card #5, deliberately before going on stage.

### Which cards

The cards are chosen when the demo is cut on 2026-11-16 or 2026-11-17, not now, because the days before ConCon are heavy development days and any card reserved earlier could be worked, or its bug fixed on the side, before the talk. At the cut, take from the board's Backlog, or enter fresh in `teams/workbench/cards.json`, a set that spans the chain so the modes have something to choose between: two small `fix_bug` cards the AI can finish inside a talk (a fix, the `check` workflow at about 40 s and the `ai-review` critic at a few minutes), one interaction card where the person drives, and one judgment card such as `frame_problem` that the person does alone. Prefer an AI card whose fix shows on the board itself once merged. The steps below name the cards as #A (the AI's) and #B (the person's).

### Before the talk

Rehearse on a copy, because a rehearsal works the real cards. Copy `teams/workbench/board.db` aside before the rehearsal and back after it, close the rehearsal's pull requests unmerged and delete their branches. Then, on the day, start the loop as in `docs/dev-loop.md` under "Running the loop locally" (`team:serve` and `gh webhook forward`), start the web app with `API_URL=http://localhost:3000`, and open a Claude Code session in the repository with the App's environment set (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`). The critic only runs once `ANTHROPIC_API_KEY` is a repository secret (task 3 in `docs/next.md`).

### The flow

1. **The board.** Real cards in Backlog, and #1 to #5 done. Say what #1 to #5 were: the board built the loop it is about to show.
2. **I choose what I do and what the AI does.** On Mikael's profile (`#/teammates/mikael`), set a mode per step and say why each time: `fix_bug` "AI does it, I verify", because a small fix with a test is cheap to check; `implement_interactions` "AI assists, I drive", because how a screen feels is mine to shape; `frame_problem` "I do it", because framing a problem is judgment. Then open the AI's profile and show what follows: what it may pick and what is "Not mine".
3. **Hand the AI its card.** Move #A to Ready; until #15 is built, that is `curl -X POST localhost:3000/api/cards/<A>/status -H 'content-type: application/json' -d '{"actor":"mikael","from":"backlog","to":{"state":"ready"}}'`. In Claude Code: "Work the next card on the workbench board that you may pick." It picks #A in `delegate`, branches, pushes as the App and opens a pull request; the board follows each step live.
4. **Take my own card.** While the AI works, move #B to Ready and pick it as Mikael; until #15 is built, the same status call for #B and then `curl -X POST localhost:3000/api/cards/<B>/pick -H 'content-type: application/json' -d '{"actor":"mikael","mode":"manual"}'`. Ask the AI to pick it too and show the refusal: the person chose to do this one.
5. **Come back for the review.** When `check` and the critic have reported on #A, read the critic's review, approve and merge. The card moves to Done, and after pulling `main` its fix shows on the board.

If the AI asks a question on the way, answer it on the card; that is the point of Part 2 happening for real. If GitHub or the network fails, go to Part 2.

## Part 2: the invented team

### Before the talk (Part 2)

The demo runs from the git tag `concon-demo` (set on 2026-11-09 at `35beb00`), so work merged to `main` after that cannot change it. Check it out first with `git checkout concon-demo`.

Run these from the repository root on the demo machine. The default database is `apps/api/data/workbench.db` (relative to `apps/api`, because `pnpm --filter` runs scripts there); the seed refuses a database that already holds teammates, so a fresh demo always starts by deleting it.

```sh
pnpm install
rm -f apps/api/data/workbench.db
pnpm --filter @workbench/api db:seed
```

The seed prints `Seeded file:data/workbench.db with invented example data; Sprint 4 (invented) runs … to ….` Migrations run whenever the API or a CLI opens the database, so a freshly seeded file is already up to date.

Seed on the day of the talk, or at most eleven days before it. Sprint 4 is the running cycle: it starts at 06:00 UTC two days before the seed runs and lasts two weeks, so seeded on any day from 2026-11-07 to the morning of 2026-11-18 it holds the talk, and everything done on stage lands in the cycle log under the board. A database seeded earlier shows Sprint 4 as ended and the live events stay out of the panel; reseed.

Then start the API and the web app in two terminals:

```sh
# terminal 1: API on http://localhost:3000/api (PORT overrides the port)
pnpm --filter @workbench/api start

# terminal 2: web on http://localhost:5173; the Vite proxy sends /api to API_URL, default http://localhost:3000
pnpm --filter @workbench/web dev --port 5173 --strictPort
```

`--strictPort` makes Vite fail loudly if 5173 is taken instead of quietly moving to 5174, which is what happened with a stale Vite process on 2026-11-09 (see "If something goes wrong"). `pnpm dev` at the root starts both at once, but two terminals make it easier to see which one complains.

Open `http://localhost:5173/` in the browser and keep a third terminal ready for the AI run. Check before going on stage that the board's connection indicator says **Live**, that the title reads "Team board · Sprint 4 (invented)", that #108 sits in **Ready** and that #106 sits in **Needs input**, waiting on `domain_rules` (caretaker's fault records) and relayed by PO.

### The demo (Part 2)

#### 1. The board as it stands

**Do:** show `http://localhost:5173/`.

**The audience sees** five people around one board: PO, UX, FE, BE and the AI teammate. The title says "Team board · Sprint 4 (invented)". Five of eight cards are done. #106 (`define_api_contract`) is in Needs input, red, "Waiting on: domain_rules (caretaker's fault records)" and "Relayed by PO", because the AI asked something only the caretaker can answer, the backend developer cannot say it either, and the caretaker is not on the team, so the product owner passes the question on and records the answer (since 2026-11-13). #108 (`refine_ui_spec`, owned by FE) is in Ready. Under the board, "Cycle log · 7 Nov – 21 Nov" (the dates follow the seed day) holds one line so far: PO moved #108 to Ready at the start of the sprint. The earlier history is in Sprints 1 to 3, which have ended.

**Why it matters:** the AI is a teammate on the same board, not a side panel. The red column is the first instance of the point the whole demo makes: the AI asked instead of guessing, and the work waits on a person in plain view.

#### 2. Run the AI teammate

**Do:** in the third terminal:

```sh
curl -X POST http://localhost:3000/api/teammates/invented-ai/run
```

**The audience sees**, without a reload, #108 jump from Ready to Needs input with "Waiting on a person: FE" and the "AI assists" pill, and five new lines at the top of the cycle log, one per event of the run: the AI picked #108 in AI assists, moved it to In progress, posted a report, asked FE a question ("which existing components the developer trusts and which they avoid"), and moved #108 to Needs input. The curl answer is the card and the same five events, written in one atomic write.

**Why it matters:** the AI picked a card only because the frontend developer's profile puts `refine_ui_spec` in "AI assists, I drive". It read what it could, reported what it found, and stopped at the knowledge only a person holds. It did not invent an answer. The run uses the stub provider and calls no model, which is worth saying: the demo is about the collaboration rules, not about model quality.

#### 3. Answer the question on the card

**Do:** click #108 on the board, or open `http://localhost:5173/#/cards/invented-108`. Type an answer in the box under "Answer, and why (kept in the decision log)", for example *"Invented: reuse the booking list and the toast; avoid the old modal, it traps focus."*, and click **Answer and resume** at the top right.

**The audience sees** the card screen: the open question with who asked whom and why it blocks, "How this card is worked" read from the function in `process/` (opens, asks, writes, decides), and the checks. The screen says "Answering as Frontend developer". After the click the open question disappears, the status chip turns to In progress, and the card log on the right gains "FE answered on #108" and "FE moved #108 to In progress", live.

**Why it matters:** the person who holds the knowledge answers, and the answer and its reason go into the decision log, not into a chat that disappears. The "decides" field on every step names a person.

#### 4. Change a mode on a person's profile

**Do:** open `http://localhost:5173/#/teammates/invented-fe` (the FE panel on the board links there). In "My chain of steps", on "Turn the issue into a buildable UI spec", click **I do it** instead of **AI assists**.

**The audience sees** the bar turn from "AI assists, I drive" to "I do it", and the side panel "The AI may pick on its own" change from listing `refine_ui_spec` to "Nothing. No step is in a mode the AI teammate works in." Back on the board, the cycle log has a new line, "FE changed their mode for refine_ui_spec to I do it · was: AI assists", which is a `mode_changed` event.

**Why it matters:** each person decides, step by step, how much the AI does in their work, and only that person can change it: the API answers 403 "a person sets their own modes" if someone else tries. The change is an event like any card move, so the team can see when Alex changed how they work with AI.

#### 5. Filter a log

**Do:** go back to the board. Next to the "Cycle log" heading, open **Filter · All events**; the panel says "Shown in the cycle log, for the whole team". Pick yourself under "Changing as" first (it defaults to PO; choose "FE · Alex Example (invented frontend developer)"), then untick `report_posted`.

**The audience sees** the summary change to "Hiding 1 of 8", the AI's report line disappear, and a new line at the top: "FE changed the cycle log filter · now hides report_posted". The same control exists on the card log at `#/cards/invented-108` and on the AI's "What I did last", each with its own filter.

**Why it matters:** even how the team looks at its own history is a team decision, recorded as a `log_filter_changed` event with who made it. The filter is shared, not a personal view, and a change made from a stale screen is refused with 409 rather than silently overwriting someone else's. Only a person can set a filter; the AI is refused with 403.

#### 6. Show the AI teammate's profile

**Do:** open `http://localhost:5173/#/teammates/invented-ai` (or click the AI's panel on the board).

**The audience sees** "How I work with the team": every step with each owner's mode and whether the AI may pick it. "Turn the issue into a buildable UI spec" now says "Not mine", with the reason that FE works it in manual, which is the change from step 4. "On now" shows #108, "I may pick next" says "Nothing in Ready that I may pick.", "Questions I asked" lists every question with who answered it, including the one from step 3, and "Always yours" ends with the rule that the AI never answers a question or moves a card past Needs input.

**Why it matters:** the AI's profile is not configured anywhere; it is derived from the people's choices and the event stream. That is the closing point: the people set the terms, the AI shows what follows from them, and the record of how the team works is the events themselves.

## If something goes wrong

**The board title shows no sprint, or the cycle log heading ends in "· ended" and live events do not appear in it.** The database was seeded more than about eleven days ago, so Sprint 4 has ended. Reseed as below.

**The board is empty, a screen shows an error, or the seed says "already holds data".** The local database is stale. Migrations apply on their own when the API starts, but a database seeded before the `role` column (added 2026-11-09) has teammates without a role, and an old seed has the wrong cards. Stop the API, then run `rm -f apps/api/data/workbench.db` and `pnpm --filter @workbench/api db:seed`, and start the API again. Reseeding is always the safe choice for the demo.

**The AI run answers `409 {"error":"conflict","reason":"invented-ai has no card it may pick"}`.** That is correct behaviour, not a failure: the seed has exactly one card the AI may pick, #108, and a second run finds nothing in Ready that it may work. It also happens after step 4, since FE's step is then manual. To run step 2 again, reseed. On stage, the 409 can be turned into a point: the AI does not go looking for work it has not been given.

**The browser does not load, or the board never says Live.** A stale Vite process may hold port 5173; on 2026-11-09 one did and did not respond. Find it with `lsof -iTCP:5173 -sTCP:LISTEN` and stop it with `kill <pid>`, or start Vite on another port (`--port 5174 --strictPort`) and open that. If the board loads but stays offline, check that the API is running (`curl http://localhost:3000/api/health`) and that `API_URL` is unset or points at it.

**A curl on stage goes to the wrong port.** If the API was started with `PORT=…`, use that port in the run command and start Vite with `API_URL=http://localhost:<port>`.

## Known issues seen in the dry run

None of these breaks the demo, but each is visible on screen and worth knowing before someone asks.

- The log filter defaults "Changing as" to PO, because there is no sign-in. If a box is ticked before a person is picked, the event says PO changed the filter. Pick the right person first.
- Cycle log lines from an earlier day show the weekday or the date instead of the time ("Sat" for #108's move to Ready), as the card log does.
- The AI's board panel lists "Now: #106 · #107 · #108", which includes cards it only assists on or that are waiting on someone else; it can look as if the AI is doing three things at once.
