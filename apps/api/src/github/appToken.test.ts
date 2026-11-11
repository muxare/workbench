// The App's JWT and the token exchange, with a key made for the test and a
// fake fetch; nothing here reaches GitHub. The App id 4242 is invented.
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appJwt, installationToken } from "./appToken.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("appJwt", () => {
  it("is an RS256 JWT issued by the App, backdated a minute and valid ten", () => {
    const jwt = appJwt("4242", PEM, new Date("2026-11-11T12:00:00Z"));
    const [header, payload, signature] = jwt.split(".") as [string, string, string];
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    const iat = Date.parse("2026-11-11T12:00:00Z") / 1000 - 60;
    expect(decode(payload)).toEqual({ iat, exp: iat + 600, iss: "4242" });
    expect(verify("sha256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("installationToken", () => {
  it("finds the repository's installation and creates a token for it", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const body = url.endsWith("/installation") ? { id: 77 } : { token: "ghs_invented", expires_at: "2026-11-11T13:00:00Z" };
      return new Response(JSON.stringify(body), { status: url.endsWith("/installation") ? 200 : 201 });
    }) as typeof fetch;
    const result = await installationToken("4242", PEM, "muxare/workbench", fakeFetch);
    expect(result).toEqual({ token: "ghs_invented", expires_at: "2026-11-11T13:00:00Z" });
    expect(calls).toEqual(["GET https://api.github.com/repos/muxare/workbench/installation", "POST https://api.github.com/app/installations/77/access_tokens"]);
  });

  it("says which call failed when GitHub refuses", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })) as typeof fetch;
    await expect(installationToken("4242", PEM, "muxare/workbench", fakeFetch)).rejects.toThrow("GET /repos/muxare/workbench/installation: 404 Not Found");
  });
});
