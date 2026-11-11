// `node apps/mcp/src/main.ts`: the workbench MCP server over stdio, for a
// Claude Code session (registered in .mcp.json at the repository root).
// WORKBENCH_API_URL is the API to talk to, by default the port team:serve
// listens on; WORKBENCH_ACTOR is the teammate the session acts as, by default
// the board's only AI teammate. stdout carries the protocol, so everything
// else goes to stderr.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { WorkbenchClient } from "./client.ts";
import { createServer } from "./server.ts";

const DEFAULT_API_URL = "http://localhost:3000";

const apiUrl = process.env.WORKBENCH_API_URL || DEFAULT_API_URL;
const actor = process.env.WORKBENCH_ACTOR || undefined;
const client = new WorkbenchClient(apiUrl);

serveStdio(() => createServer(actor === undefined ? { client } : { client, actor }), {
  onerror: (err) => console.error(`workbench mcp: ${err.message}`),
});
console.error(`workbench mcp: serving over stdio, API at ${apiUrl}${actor ? `, acting as ${actor}` : ""}`);
