# Workbench MCP server

This package lets a Claude Code session work from the workbench board, as stage 3 of `docs/dev-loop.md` describes. It is an MCP server over stdio that talks to the workbench API over HTTP and acts as the board's AI teammate. It never opens the database, so every rule the board has is enforced by the API, and a refusal comes back to the session as a tool error with the API's reason.

## How to use it

Start the board's API first, for example `pnpm --filter @workbench/api team:serve teams/workbench`, which listens on port 3000. Then start Claude Code in the repository root. The server is registered in `.mcp.json` at the root, so Claude Code asks once for approval to use the project's `workbench` server, and its tools appear as `mcp__workbench__…`. `claude mcp list` shows whether it connected.

Two environment variables change what it talks to. `WORKBENCH_API_URL` is the API's address and defaults to `http://localhost:3000`; set it before starting Claude Code to point a session at a scratch API. `WORKBENCH_ACTOR` is the teammate the session acts as; without it the server uses the board's only AI teammate and refuses to guess when the board has more than one. The server is started as `node apps/mcp/src/main.ts`, relative to the repository root, and needs Node 22.18 or later, which runs the TypeScript directly.

A session works a card in this order:

1. `list_cards` shows the board, optionally only the cards in one state, such as `ready`.
2. `get_card` reads one card with its function definition from `process/`, the mode the owner works it in, what that mode's protocol lets the AI do, its questions and its log, and the branch name to use.
3. `pick_card` picks a ready card as the AI. The API refuses a card whose owner works its function in `manual`, a card a person has not opened where the protocol says a person opens, and a card that depends on a card not done.
4. `link_branch` names the branch, `wb/<card id>-<short title>`, and the pull request body line, `Workbench: #<card id>`, or checks a branch name the session already chose. It records nothing: the first push of the branch reaches the board through GitHub's webhook, which records `workspace_linked`.
5. `ask_question` asks a person on the card, by default its owner, which moves the card to needs input, and then waits for the answer for up to `wait_seconds` (300 by default, at most 1500). If no answer comes in time it returns the question id, and `wait_for_answer` waits again. The person answers on the board, in the card screen or through the API.
6. `post_report` posts what was done on the card, without moving it.

Opening the pull request moves the card to review through the webhook, and a person's approval and the merge move it to done; the MCP server offers no tool for those moves.

## How waiting works

The wait follows the API's live event stream, `GET /api/events`. It opens the stream at its current end first and then reads the card once, so an answer given before the stream opened is found on the card and one given later arrives as an `answered` event. When the time is up, or the API closes the stream, it reads the card once more before saying there is no answer. The longest wait is 25 minutes because Claude Code gives up on a stdio tool call that stays silent for 30 minutes.

## Tests

`pnpm --filter @workbench/mcp test` runs the tools against the real API app from `apps/api` over an in-memory database, reached through the app's own `request` instead of the network.
