import { describe, expect, it } from "vitest";
import { parse } from "./args.ts";
import { services } from "./services.ts";

const names = (r: ReturnType<typeof parse>) => ("error" in r ? r.error : r.services.map((s) => s.name));

describe("parse", () => {
  it("defaults to every service in the table's order", () => {
    expect(names(parse(["start"]))).toEqual(["api", "hook", "web"]);
    expect(names(parse(["stop", "all"]))).toEqual(["api", "hook", "web"]);
  });

  it("keeps the table's order whatever order services are named in", () => {
    expect(names(parse(["restart", "web", "api"]))).toEqual(["api", "web"]);
  });

  it("refuses unknown commands and services", () => {
    expect(names(parse(["launch"]))).toContain("unknown command 'launch'");
    expect(names(parse(["start", "db"]))).toContain("unknown service 'db'");
  });

  it("prints usage without a command", () => {
    expect(names(parse([]))).toContain("usage: pnpm wb");
  });

  it("takes exactly one service for logs, and -f only there", () => {
    expect(names(parse(["logs"]))).toBe("logs takes exactly one service");
    expect(names(parse(["logs", "api", "web"]))).toBe("logs takes exactly one service");
    const r = parse(["logs", "api", "-f"]);
    expect("error" in r ? r.error : r.follow).toBe(true);
    expect(names(parse(["start", "-f"]))).toBe("-f only goes with logs");
  });

  it("names each service once in the table", () => {
    expect(new Set(services.map((s) => s.name)).size).toBe(services.length);
  });
});
