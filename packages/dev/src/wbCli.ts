// `pnpm wb <command> [service...]`: start, stop, restart and inspect the
// processes of the local development loop (see services.ts and
// docs/dev-loop.md, "Running the loop locally").
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { formatDuration, logPath, processCommand, start, status, stop, type Paths } from "./manager.ts";
import { parse, usage } from "./args.ts";
import { hookRepo, services } from "./services.ts";

function hookOnGithub(): string {
  try {
    const out = execFileSync("gh", ["api", `repos/${hookRepo}/hooks`, "--jq", '[.[] | select(.name == "cli")] | length'], {
      encoding: "utf8",
      timeout: 8_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Number(out.trim()) > 0 ? "the cli hook exists on GitHub" : "no cli hook on GitHub";
  } catch {
    return "could not ask GitHub about the cli hook";
  }
}

async function main(): Promise<number> {
  const parsed = parse(process.argv.slice(2));
  if ("error" in parsed) {
    const help = parsed.error === usage;
    (help ? console.log : console.error)(parsed.error);
    return help ? 0 : 2;
  }
  const paths: Paths = { root: resolve(import.meta.dirname, "../../.."), runDir: resolve(import.meta.dirname, "../../../.run") };
  const report = (r: { ok: boolean; message: string }) => {
    (r.ok ? console.log : console.error)(r.message);
    return r.ok;
  };
  let ok = true;

  switch (parsed.command) {
    case "start":
      for (const s of parsed.services) ok = report(await start(paths, s)) && ok;
      break;
    case "stop":
      for (const s of [...parsed.services].reverse()) ok = report(await stop(paths, s)) && ok;
      break;
    case "restart": {
      // Restarting the API under a running forwarder loses the deliveries
      // made while it is down, so say how long that was.
      const hook = services.find((s) => s.name === "hook");
      const forwarding = hook !== undefined && status(paths, hook).running;
      for (const s of [...parsed.services].reverse()) ok = report(await stop(paths, s)) && ok;
      for (const s of parsed.services) {
        const began = Date.now();
        ok = report(await start(paths, s)) && ok;
        if (s.name === "api" && forwarding && !parsed.services.some((x) => x.name === "hook")) {
          console.log(`api was down for about ${formatDuration(Date.now() - began)} while the forwarder ran; a webhook delivered in that window is lost.`);
        }
      }
      break;
    }
    case "status":
      for (const s of parsed.services) {
        const st = status(paths, s);
        const port = st.port === undefined ? "" : ` port ${String(st.port)}`;
        if (st.running) {
          const since = st.since ? `, up ${formatDuration(Date.now() - Date.parse(st.since))}` : "";
          console.log(`${s.name.padEnd(5)} running  pid ${String(st.pid)}${port}${since}`);
        } else if (st.portHolders.length > 0) {
          const who = st.portHolders.map((pid) => `${String(pid)} ${processCommand(pid)}`).join("; ");
          console.log(`${s.name.padEnd(5)} stopped,${port} held by ${who}`);
        } else {
          console.log(`${s.name.padEnd(5)} stopped`);
        }
        if (s.name === "hook") console.log(`      ${hookOnGithub()}`);
      }
      break;
    case "logs": {
      const s = parsed.services[0]!;
      const args = parsed.follow ? ["-n", "50", "-F", logPath(paths, s)] : ["-n", "50", logPath(paths, s)];
      const child = spawn("tail", args, { stdio: "inherit" });
      return await new Promise((res) => child.on("exit", (code) => res(code ?? 0)));
    }
  }
  return ok ? 0 : 1;
}

process.exit(await main());
