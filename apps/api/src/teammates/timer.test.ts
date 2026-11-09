// All example data in these tests is invented.
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../db/client.ts";
import { loadFunctionIds } from "../process.ts";
import { inventedSeedAt } from "../seed/invented.ts";

/** The invented seed as loaded on 2026-11-07, so Sprint 4 runs from 2026-11-05 to 2026-11-19. */
const inventedSeed = inventedSeedAt(new Date("2026-11-07T08:00:00Z"));
import { cardStatus, seed } from "../store.ts";
import type { TeammateRun } from "./runner.ts";
import { startTeammateTimer, timerInterval } from "./timer.ts";
import { stubProvider } from "./stubProvider.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("timerInterval", () => {
  it("is off when TEAMMATE_INTERVAL_MS is unset or empty", () => {
    expect(timerInterval(undefined)).toBeUndefined();
    expect(timerInterval("")).toBeUndefined();
  });

  it("accepts whole milliseconds from 1000 and refuses anything else", () => {
    expect(timerInterval("30000")).toBe(30000);
    for (const bad of ["abc", "500", "1500.5", "-2000"]) expect(() => timerInterval(bad)).toThrow(/TEAMMATE_INTERVAL_MS/);
  });
});

describe("startTeammateTimer", () => {
  it("runs a step on each tick until stopped, and reports a tick with nothing to pick as no run", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const db = await openDb(":memory:");
    await seed(db, inventedSeed, loadFunctionIds());
    const runs: TeammateRun[] = [];
    const errors: unknown[] = [];
    const stop = startTeammateTimer(db, {
      teammateId: "invented-ai",
      provider: stubProvider,
      intervalMs: 1000,
      onRun: (run) => runs.push(run),
      onError: (err) => errors.push(err),
    });

    expect((await cardStatus(db, "invented-108")).state).toBe("ready");
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]?.card.id).toBe("invented-108");
    expect((await cardStatus(db, "invented-108")).state).toBe("needs_input");

    stop();
    vi.advanceTimersByTime(5000);
    expect(runs).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("keeps going after a failing tick", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const db = await openDb(":memory:");
    await seed(db, inventedSeed, loadFunctionIds());
    const errors: unknown[] = [];
    const stop = startTeammateTimer(db, {
      teammateId: "invented-nobody",
      provider: stubProvider,
      intervalMs: 1000,
      onError: (err) => errors.push(err),
    });
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(errors).toHaveLength(2));
    stop();
  });
});
