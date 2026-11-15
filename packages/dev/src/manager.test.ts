import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatDuration, groupAlive, portHolders, readState, start, status, stop, type Paths } from "./manager.ts";
import type { Service } from "./services.ts";

// A free port, found by letting the OS choose one.
async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      srv.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

// An HTTP server that also spawns a child which never exits, the way pnpm
// spawns tsx: stopping must take the whole group down.
function fakeService(port: number): Service {
  const script = `
    require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    require("node:http").createServer((q, r) => r.end("ok")).listen(${String(port)}, "127.0.0.1", () => console.log("listening"));
  `;
  return {
    name: "fake",
    description: "a test server",
    command: [process.execPath, "-e", script],
    launch: () => ({ args: [], env: {} }),
    port,
    ready: { kind: "http", url: `http://127.0.0.1:${String(port)}/` },
    readyTimeoutMs: 10_000,
  };
}

const dirs: string[] = [];
function paths(): Paths {
  const runDir = mkdtempSync(join(tmpdir(), "wb-test-"));
  dirs.push(runDir);
  return { root: process.cwd(), runDir };
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("start and stop", () => {
  it("starts a detached service, waits for it, and stops its whole group", async () => {
    const p = paths();
    const s = fakeService(await freePort());
    const started = await start(p, s);
    expect(started).toMatchObject({ ok: true });
    const pid = readState(p, s)?.pid ?? 0;
    expect(groupAlive(pid)).toBe(true);
    expect(status(p, s)).toMatchObject({ running: true, pid });

    expect((await start(p, s)).message).toContain("already running");

    expect(await stop(p, s)).toMatchObject({ ok: true });
    expect(groupAlive(pid)).toBe(false);
    expect(portHolders(s.port ?? 0)).toEqual([]);
    expect(readState(p, s)).toBeUndefined();
    expect((await stop(p, s)).message).toBe("fake was not running.");
  }, 30_000);

  it("refuses to start on a port someone else holds, and stop clears it", async () => {
    const p = paths();
    const s = fakeService(await freePort());
    // Started under another run directory: a stray from an earlier session.
    const other = paths();
    expect(await start(other, s)).toMatchObject({ ok: true });
    const stray = readState(other, s)?.pid ?? 0;

    const refused = await start(p, s);
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain("is held by");

    const cleared = await stop(p, s);
    expect(cleared.message).toContain("cleared port");
    expect(portHolders(s.port ?? 0)).toEqual([]);
    await stop(other, s); // its spawned child
    expect(groupAlive(stray)).toBe(false);
  }, 30_000);

  it("reports a service that exits before it is ready, with its log", async () => {
    const p = paths();
    const s: Service = { ...fakeService(await freePort()), command: [process.execPath, "-e", "console.log('boom'); process.exit(3)"] };
    const r = await start(p, s);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("it exited");
    expect(r.message).toContain("boom");
  }, 30_000);
});

describe("formatDuration", () => {
  it("uses seconds, minutes, then hours", () => {
    expect(formatDuration(4_200)).toBe("4 s");
    expect(formatDuration(125_000)).toBe("2 min");
    expect(formatDuration(3_900_000)).toBe("1 h 5 min");
  });
});
