// Start, stop and inspect detached service processes. Each service runs in
// its own process group, so stopping it also stops the children that pnpm,
// tsx and Vite spawn. Its PID and log live in a run directory (.run/ at the
// repository root), so a service outlives the terminal or Claude Code session
// that started it, and any later session can stop or restart it.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Service } from "./services.ts";

export type RunState = { pid: number; startedAt: string; command: string[] };

export type Paths = { root: string; runDir: string };

export const statePath = (p: Paths, s: Service) => join(p.runDir, `${s.name}.json`);
export const logPath = (p: Paths, s: Service) => join(p.runDir, `${s.name}.log`);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function readState(p: Paths, s: Service): RunState | undefined {
  const path = statePath(p, s);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunState;
  } catch {
    return undefined;
  }
}

// Whether any process in the group led by pid is alive.
export function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (e) {
    // EPERM: the group exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

// The PIDs listening on a TCP port, from lsof.
export function portHolders(port: number): number[] {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${String(port)}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
    return [...new Set(out.split("\n").filter(Boolean).map(Number))];
  } catch {
    return []; // lsof exits 1 when nothing matches
  }
}

export function processCommand(pid: number): string {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim();
  } catch {
    return "(gone)";
  }
}

async function ready(s: Service, pid: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const deadline = Date.now() + s.readyTimeoutMs;
  if (s.ready.kind === "alive") {
    await sleep(s.ready.afterMs);
    return groupAlive(pid) ? { ok: true } : { ok: false, reason: "it exited" };
  }
  while (Date.now() < deadline) {
    if (!groupAlive(pid)) return { ok: false, reason: "it exited" };
    try {
      const res = await fetch(s.ready.url, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return { ok: true };
    } catch {
      // not listening yet
    }
    await sleep(250);
  }
  return { ok: false, reason: `${s.ready.url} did not answer within ${String(s.readyTimeoutMs / 1000)} s` };
}

export function tail(path: string, lines: number): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
}

export type Result = { ok: boolean; message: string };

export async function start(p: Paths, s: Service): Promise<Result> {
  const state = readState(p, s);
  if (state && groupAlive(state.pid)) return { ok: true, message: `${s.name} is already running (pid ${String(state.pid)}).` };
  if (s.port !== undefined) {
    const holders = portHolders(s.port);
    if (holders.length > 0) {
      const who = holders.map((pid) => `${String(pid)} ${processCommand(pid)}`).join("; ");
      return { ok: false, message: `${s.name}: port ${String(s.port)} is held by ${who}. \`pnpm wb stop ${s.name}\` clears it.` };
    }
  }
  const launch = s.launch();
  if ("error" in launch) return { ok: false, message: `${s.name}: ${launch.error}` };
  if (launch.warning) console.warn(`${s.name}: warning: ${launch.warning}`);

  mkdirSync(p.runDir, { recursive: true });
  const log = logPath(p, s);
  if (existsSync(log)) renameSync(log, `${log}.1`);
  const fd = openSync(log, "a");
  const [cmd, ...args] = [...s.command, ...launch.args];
  if (cmd === undefined) throw new Error(`${s.name} has no command`);
  const child = spawn(cmd, args, {
    cwd: p.root,
    env: { ...process.env, ...launch.env },
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  const pid = child.pid;
  if (pid === undefined) return { ok: false, message: `${s.name}: could not spawn ${cmd}.` };
  child.unref();
  const record: RunState = { pid, startedAt: new Date().toISOString(), command: s.command };
  writeFileSync(statePath(p, s), `${JSON.stringify(record, null, 2)}\n`);

  const r = await ready(s, pid);
  if (r.ok) return { ok: true, message: `${s.name} started (pid ${String(pid)}): ${s.description}.` };
  await stop(p, s);
  return { ok: false, message: `${s.name} did not start: ${r.reason}. Last lines of ${log}:\n${tail(log, 20)}` };
}

async function killAndWait(alive: () => boolean, signal: (sig: NodeJS.Signals) => void): Promise<void> {
  if (!alive()) return;
  signal("SIGTERM");
  for (let i = 0; i < 40 && alive(); i++) await sleep(125);
  if (alive()) signal("SIGKILL");
  for (let i = 0; i < 40 && alive(); i++) await sleep(125);
}

function trySignal(target: number, sig: NodeJS.Signals): void {
  try {
    process.kill(target, sig);
  } catch {
    // already gone
  }
}

export async function stop(p: Paths, s: Service): Promise<Result> {
  const notes: string[] = [];
  const state = readState(p, s);
  if (state && groupAlive(state.pid)) {
    await killAndWait(() => groupAlive(state.pid), (sig) => trySignal(-state.pid, sig));
    notes.push(groupAlive(state.pid) ? `pid ${String(state.pid)} would not stop` : `stopped pid ${String(state.pid)}`);
  }
  rmSync(statePath(p, s), { force: true });
  // Anything else on the port: a process started outside `pnpm wb`, or one left over from an earlier session.
  if (s.port !== undefined) {
    for (const pid of portHolders(s.port)) {
      const command = processCommand(pid);
      // Only the holder itself, never its group: a process started from a
      // shell tool may share its group with the session that started it.
      const port = s.port;
      await killAndWait(
        () => portHolders(port).includes(pid),
        (sig) => trySignal(pid, sig),
      );
      notes.push(`cleared port ${String(s.port)} from pid ${String(pid)} (${command})`);
    }
  }
  if (notes.length === 0) return { ok: true, message: `${s.name} was not running.` };
  const failed = notes.some((n) => n.includes("would not stop")) || (s.port !== undefined && portHolders(s.port).length > 0);
  return { ok: !failed, message: `${s.name}: ${notes.join("; ")}.` };
}

export type Status = { name: string; running: boolean; pid?: number; since?: string; port?: number; portHolders: number[] };

export function status(p: Paths, s: Service): Status {
  const state = readState(p, s);
  const running = state !== undefined && groupAlive(state.pid);
  return {
    name: s.name,
    running,
    ...(running ? { pid: state.pid, since: state.startedAt } : {}),
    ...(s.port !== undefined ? { port: s.port } : {}),
    portHolders: s.port !== undefined ? portHolders(s.port) : [],
  };
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${String(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${String(m)} min`;
  const h = Math.floor(m / 60);
  return `${String(h)} h ${String(m % 60)} min`;
}
