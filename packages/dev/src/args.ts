// Argument parsing for `pnpm wb`, apart from the CLI so it can be tested.
import { services, type Service } from "./services.ts";

export const commands = ["start", "stop", "restart", "status", "logs"] as const;
export type Command = (typeof commands)[number];

export type Parsed = { command: Command; services: Service[]; follow: boolean } | { error: string };

export const usage = `usage: pnpm wb <command> [service...]

commands:
  start [service...]     start services that are not running (default: all)
  stop [service...]      stop services and clear their ports (default: all)
  restart [service...]   stop, then start (default: all)
  status                 show what runs, on which port, since when
  logs <service> [-f]    print the end of a service's log, or follow it

services:
${services.map((s) => `  ${s.name.padEnd(6)} ${s.description}`).join("\n")}

Logs and PIDs are in .run/ at the repository root.`;

// Services keep the table's order (api before hook before web), whatever
// order they were named in; stop and restart reverse it where it matters.
export function parse(argv: string[], table: Service[] = services): Parsed {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "-h" || command === "--help") return { error: usage };
  if (!(commands as readonly string[]).includes(command)) return { error: `unknown command '${command}'\n\n${usage}` };
  const follow = rest.includes("-f") || rest.includes("--follow");
  const names = rest.filter((a) => a !== "-f" && a !== "--follow");
  const unknown = names.filter((n) => n !== "all" && !table.some((s) => s.name === n));
  if (unknown.length > 0) return { error: `unknown service '${unknown.join("', '")}'; one of ${table.map((s) => s.name).join(", ")}` };
  const all = names.length === 0 || names.includes("all");
  const chosen = all ? table : table.filter((s) => names.includes(s.name));
  if (command === "logs" && (all || chosen.length !== 1)) return { error: "logs takes exactly one service" };
  if (follow && command !== "logs") return { error: "-f only goes with logs" };
  return { command: command as Command, services: chosen, follow };
}
