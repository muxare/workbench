// The long-running processes of the local development loop, as described in
// docs/dev-loop.md under "Running the loop locally". `pnpm wb` starts, stops
// and restarts them; this table is the one place their commands live.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Readiness =
  // An HTTP GET that must answer 2xx.
  | { kind: "http"; url: string }
  // The process must still be alive after this many milliseconds.
  | { kind: "alive"; afterMs: number };

// What a service needs at the moment it is spawned: extra arguments and
// environment, and a warning to print; or the reason it cannot start.
export type Launch = { args: string[]; env: Record<string, string>; warning?: string } | { error: string };

export type Service = {
  name: string;
  description: string;
  command: string[];
  launch: () => Launch;
  // The port the service listens on, if any. `stop` also clears whatever else holds it.
  port?: number;
  ready: Readiness;
  // How long `start` waits for readiness before giving up.
  readyTimeoutMs: number;
};

export const team = "teams/workbench";
export const hookRepo = "muxare/workbench";
const apiPort = 3000;
const webPort = 5173;
export const secretPath = join(homedir(), ".config", "workbench", "webhook-secret");

function readSecret(): string | undefined {
  if (!existsSync(secretPath)) return undefined;
  const secret = readFileSync(secretPath, "utf8").trim();
  return secret === "" ? undefined : secret;
}

export const services: Service[] = [
  {
    name: "api",
    description: `the API on ${team}'s board`,
    command: ["pnpm", "--filter", "@workbench/api", "team:serve", team],
    launch: () => {
      const env = { PORT: String(apiPort) };
      const secret = readSecret();
      if (secret === undefined) return { args: [], env, warning: `${secretPath} is missing, so the webhook endpoint will answer 503.` };
      return { args: [], env: { ...env, GITHUB_WEBHOOK_SECRET: secret } };
    },
    port: apiPort,
    ready: { kind: "http", url: `http://localhost:${String(apiPort)}/api/health` },
    readyTimeoutMs: 30_000,
  },
  {
    name: "hook",
    description: `gh webhook forward from ${hookRepo} to the API`,
    command: [
      "gh",
      "webhook",
      "forward",
      `--repo=${hookRepo}`,
      "--events=push,pull_request,pull_request_review,workflow_run",
      `--url=http://localhost:${String(apiPort)}/api/github/webhook`,
    ],
    // The secret is added only when spawning, so the table can be printed.
    launch: () => {
      const secret = readSecret();
      if (secret === undefined) return { error: `${secretPath} is missing; the forwarder must sign with the API's secret.` };
      return { args: [`--secret=${secret}`], env: {} };
    },
    // `gh webhook forward` exits within a second or two when the hook already
    // exists or gh is not logged in, so staying alive this long means it forwards.
    ready: { kind: "alive", afterMs: 4_000 },
    readyTimeoutMs: 10_000,
  },
  {
    name: "web",
    description: "the board in Vite",
    // strictPort: fail instead of moving to 5174 when 5173 is taken.
    command: ["pnpm", "--filter", "@workbench/web", "dev", "--port", String(webPort), "--strictPort"],
    launch: () => ({ args: [], env: {} }),
    port: webPort,
    ready: { kind: "http", url: `http://localhost:${String(webPort)}/` },
    readyTimeoutMs: 30_000,
  },
];
