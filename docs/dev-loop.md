# The development loop

As of 2026-11-11. Decided with Mikael on 2026-11-09 and 2026-11-11; the decisions and their reasons are in `docs/decisions.md`. The diagram is the artifact "Workbench Development Loop" on claude.ai.

## What this adds

So far the workbench coordinates the work: who picks a card, which mode the AI works in, who is waiting on whom. It does not see the work itself. A card says "write the booking rules" but points at no branch, no pull request and no design, and nothing that happens in those places reaches the board.

The development loop closes that gap. A card is linked to the place where its work happens, a person or the AI does the work there, and the result comes back to the board as events. A card is done when a person has approved the result, not when someone says it is finished. The loop has six steps:

1. **Card is ready.** It has a function from `process/`, an owner and no unfinished `depends_on`. This exists today.
2. **Decide who does it.** A person picks the card, or someone hands it to the AI. Picking exists today; handing a card to the AI as a recorded decision does not.
3. **Do the work.** The card is linked to a branch, and a person in their editor or the AI in an agent session works on that branch.
4. **Open for review.** The work becomes a pull request, and the board learns about it from GitHub instead of from someone moving the card.
5. **Check.** The three layers from the function template run on the result: a structural check in code, an AI critic, and a person's approval. Changes requested send the card back to step 3.
6. **Done.** A card reaches done only through an approval by a person, which keeps `decides: human` true for the work as it is for the protocols.

GitHub is the first workspace because branches, pull requests and reviews already produce the events steps 3 to 5 need. Figma and documents come later, once the loop holds for code.

## The workbench is its own first project

The loop is built and tried on this repository, `muxare/workbench`, before any other project. It is the one project where Mikael can install a GitHub App, protect `main` and change how work is done without asking anyone, and the workbench needs the development anyway, so every card on its board is real work.

This makes it an unusual project, and the doc says so rather than hide it. The team is two teammates: Mikael and the AI. Mikael holds every role, product owner, designer, frontend and backend, while the model today gives each person exactly one role. A person who holds several roles is therefore the first change the model needs. The project also says little about handoffs between people, because there is only one person, which is why it does not replace the Phase 2 run on a past project with a real team.

The work on this repository is mostly building code, and until 2026-11-11 `process/` defined only the four design-segment functions. Every card must name a function, so the coding functions from `docs/reference/team-process-map.md` had to be drafted first, following `process/template.md`. They were drafted on 2026-11-11: `implement_services` (be), `implement_interactions` (fe), and `fix_bug`, `open_pull_request` and `review_pull_request` (team). Drafting them was Phase 3 work brought forward; it added functions and no template fields, so it does not touch the open question about the four gaps the laundry room example found. Where they depart from the map is recorded in `docs/decisions.md`.

In loop terms, step 3 is one of the three building functions, which ends with commits on the card's branch; step 4 is `open_pull_request`; and step 5's human check is the approval in `review_pull_request`, with the AI critic as its `assist` mode. The model gives a card one function, so whether a card that names `implement_services` also passes through `open_pull_request` and `review_pull_request`, or each of those is a card of its own, is not decided yet.

The board for this project runs on its own database with real data and no invented seed. The invented laundry room seed stays as it is for the ConCon demo, which runs from the tag `concon-demo`.

## The three checks on this repository

Each layer of the check already has a tool here, though not all of it reports anywhere yet.

The structural check is `pnpm check`: lint, typecheck, tests and the process validator. Today it runs only in the Stop hook in a local Claude Code session. There is no CI on GitHub yet, so stage 2 adds a workflow that runs `pnpm check` on every pull request; that run is what reaches the card as `check_ran`.

The AI critic is a review by an agent that has not seen the code being written: the `design-reviewer` subagent for screens, a code review for the rest. Its findings are posted on the pull request as comments, and it never approves.

The human check is Mikael's approval of the pull request. With `main` protected, a change cannot land without it, so the rule that a person decides is enforced by GitHub rather than by convention.

## How the workbench and GitHub talk

There are three directions, and each has its own mechanism.

**From the workbench to GitHub**, for example to start the AI on a card, the workbench calls the GitHub API as a GitHub App installed on the repository. An App is chosen over a personal token because it acts as itself rather than as Mikael, its permissions are limited to the one repository and what the loop needs, and it can deliver webhooks.

**From GitHub to the workbench**, GitHub sends webhooks to a new endpoint in `apps/api`, which turns them into card events. A card is linked to its work by a naming convention: the branch is `wb/<card id>-<short title>`, and the pull request body says `Workbench: #<card id>`. The proposed mapping is:

| GitHub event | Card event |
| --- | --- |
| A branch named for the card is pushed | `workspace_linked` the first time, then `work_pushed` |
| A pull request for the card is opened or marked ready | `review_requested` |
| CI finishes on the pull request | `check_ran`, which exists today |
| A person approves the pull request | `approved` |
| A person requests changes | `changes_requested` |
| The pull request is merged | `status_changed` to `done`, allowed only after `approved` |

While the API runs on Mikael's machine, GitHub cannot reach it directly. During development, webhooks are forwarded with the GitHub CLI extension `cli/gh-webhook` (`gh webhook forward`), which needs to be installed first. A hosted API comes later, when the board must run without Mikael's machine.

**Between the agent doing the work and the workbench**, an MCP server wraps the existing REST API. The API stays the one place where rules are enforced, and the MCP server only gives agents a way to use it: list and read cards with their function definition, pick a card, ask a person a question on the card and wait for the answer, post a report, and link a branch. It is what lets the AI in a Claude Code session stop and ask instead of guessing. It also lets anyone working in Claude Code pick a card from the terminal.

## Stages

Each stage is useful on its own, and each one shows what the next one needs.

**Stage 1: track the workbench's own work on its board.** Let a person hold several roles, draft the coding functions, and start a board for this repository with Mikael and the AI as the team and the tasks from `docs/next.md` as cards. Cards are moved through the existing API and screens. This needs no GitHub work and shows quickly what the board lacks for real use.

**Stage 2: move the work to pull requests.** Add the CI workflow, protect `main` so a change needs a pull request with Mikael's approval, install the GitHub App, and build the webhook endpoint with the mapping above. Until this stage, branches are merged to `main` locally as now.

**Stage 3: put the MCP server in front of the API.** A Claude Code session picks a card from the board, asks Mikael on the card when it is stuck, opens the pull request, and the webhooks carry the rest. From here the board, not `docs/next.md`, says what comes next.

**Stage 4: let the AI work unattended.** Handing a card to the AI starts a GitHub Actions workflow that runs Claude Code on the card's branch, and the result comes back as a pull request for Mikael to review. Running the agent in GitHub rather than in the workbench means the workbench does not host it.

## `docs/next.md` during the change

`docs/next.md` stays the source of truth for what comes next until stage 3 works. During stage 1 and 2 the board holds the same tasks as cards, and the two are kept in step by hand, which is also a test of whether the board holds what `next.md` holds. When stage 3 works, the board takes over, and `next.md` is either generated from the board or retired; that choice is made then.

## Not decided here

Where the board runs once it should not depend on Mikael's machine. How Figma frames and documents are linked to cards. Whether GitHub Issues mirror the cards; the board is the source for cards and status either way. Whether opening and reviewing the pull request are steps on the building card or cards of their own.
