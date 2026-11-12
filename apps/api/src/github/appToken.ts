// The workbench acts on GitHub as a GitHub App installed on the repository, so
// what the AI does there (a branch, a pull request) is its own and not
// Mikael's, and he can approve it. An App proves who it is with a short-lived
// JWT signed by its private key (RS256), and trades that for an installation
// token scoped to the repositories it is installed on. See docs/dev-loop.md.
import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.github.com";

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

/**
 * The JWT a GitHub App signs to call the API as itself. It is backdated by a
 * minute against clock drift and lives nine minutes; GitHub allows ten.
 */
export function appJwt(appId: string, privateKeyPem: string, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat, exp: iat + 600, iss: appId }));
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), createPrivateKey(privateKeyPem));
  return `${header}.${payload}.${base64url(signature)}`;
}

export type Fetch = typeof fetch;

/**
 * One call to GitHub's REST API, authorised by `bearer`: the App's JWT or an
 * installation token. A JSON `body` is sent when given. Throws with the
 * method, path, status and GitHub's message when GitHub refuses.
 */
export async function github(fetchFn: Fetch, method: string, path: string, bearer: string, body?: unknown): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${bearer}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "workbench",
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetchFn(`${API}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const answer = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${method} ${path}: ${String(res.status)} ${String(answer.message ?? "")}`);
  return answer;
}

/** The App's own account on GitHub, `<slug>[bot]`, which its pull requests and reviews are by. */
export async function appLogin(appId: string, privateKeyPem: string, fetchFn: Fetch = fetch): Promise<string> {
  const app = await github(fetchFn, "GET", "/app", appJwt(appId, privateKeyPem));
  return `${String(app.slug)}[bot]`;
}

/** An installation token for the App on `repo` ("owner/name"); it lasts an hour. */
export async function installationToken(appId: string, privateKeyPem: string, repo: string, fetchFn: Fetch = fetch): Promise<{ token: string; expires_at: string }> {
  const jwt = appJwt(appId, privateKeyPem);
  const installation = await github(fetchFn, "GET", `/repos/${repo}/installation`, jwt);
  const created = await github(fetchFn, "POST", `/app/installations/${String(installation.id)}/access_tokens`, jwt);
  return { token: String(created.token), expires_at: String(created.expires_at) };
}
