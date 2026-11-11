// The MCP server: the tools from tools.ts registered on an McpServer, with
// the descriptions an agent reads to choose between them.
import { McpServer } from "@modelcontextprotocol/server";
import { inputs, MAX_WAIT_SECONDS, type ToolDeps, createTools } from "./tools.ts";

export const SERVER_NAME = "workbench";
export const SERVER_VERSION = "0.1.0";

export function createServer(deps: ToolDeps): McpServer {
  const tools = createTools(deps);
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Work from the workbench board as its AI teammate. Find a card with list_cards and read it with get_card, which shows its function and what the owner's mode lets the AI do. Pick it with pick_card; the board refuses cards the AI may not pick. Work on the branch link_branch names. When something only a person can settle blocks you, ask on the card with ask_question instead of guessing, and keep waiting with wait_for_answer if it times out. Post what you did with post_report. Opening the pull request moves the card to review; a person approves it.",
    },
  );
  const read = { readOnlyHint: true, openWorldHint: false } as const;
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  server.registerTool(
    "list_cards",
    { title: "List cards", description: "The cards on the workbench board: id, title, state, function, owner and dependencies.", inputSchema: inputs.list_cards, annotations: read },
    (input) => tools.list_cards(input),
  );
  server.registerTool(
    "get_card",
    {
      title: "Read a card",
      description:
        "One card with its function definition from process/, the mode its owner works it in and what that mode's protocol lets the AI do, its questions, its log, and the branch name to use.",
      inputSchema: inputs.get_card,
      annotations: read,
    },
    (input) => tools.get_card(input),
  );
  server.registerTool(
    "pick_card",
    {
      title: "Pick a card",
      description:
        "Pick a ready card as the AI teammate, moving it to in progress in its owner's mode. Refused when the mode gives the AI no part, a person must open the card first, or a card it depends on is not done.",
      inputSchema: inputs.pick_card,
      annotations: write,
    },
    (input) => tools.pick_card(input),
  );
  server.registerTool(
    "ask_question",
    {
      title: "Ask a person on the card",
      description: `Ask a question on a card in progress; the card waits on the person (its owner unless asked_of says otherwise) until they answer on the board. Then waits for the answer, up to wait_seconds (at most ${String(MAX_WAIT_SECONDS)}). If no answer comes in time, it returns the question id; call wait_for_answer to keep waiting.`,
      inputSchema: inputs.ask_question,
      annotations: write,
    },
    (input, ctx) => tools.ask_question(input, ctx.mcpReq.signal),
  );
  server.registerTool(
    "wait_for_answer",
    {
      title: "Wait for an answer",
      description: "Wait for the answer to a question asked with ask_question, up to wait_seconds. Returns at once when it is already answered.",
      inputSchema: inputs.wait_for_answer,
      annotations: read,
    },
    (input, ctx) => tools.wait_for_answer(input, ctx.mcpReq.signal),
  );
  server.registerTool(
    "post_report",
    {
      title: "Post a report",
      description: "Post a report on a card in progress, waiting for input or in review: what was done, what is left, what to look at first. Moves nothing.",
      inputSchema: inputs.post_report,
      annotations: write,
    },
    (input) => tools.post_report(input),
  );
  server.registerTool(
    "link_branch",
    {
      title: "Link a branch",
      description:
        "The branch for a card (wb/<card id>-<short title>) and the pull request body line that link the work to it, checked against the naming rule, and whether the board has seen the branch. Records nothing: the first push records the link through GitHub's webhook.",
      inputSchema: inputs.link_branch,
      annotations: read,
    },
    (input) => tools.link_branch(input),
  );
  return server;
}
