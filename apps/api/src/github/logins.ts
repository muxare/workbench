// Which teammate a GitHub account is. Every event's actor is a teammate on
// the board, so a webhook from an account that is not mapped to one records
// nothing. The map comes from `GITHUB_LOGINS` ("login=teammate,login=teammate"),
// which `team:serve` fills from `github_logins` in the team's team.json.
// GitHub logins are case-insensitive, so they are kept in lower case.

/** Parse `GITHUB_LOGINS`; throws on an entry that is not `login=teammate`. */
export function parseGithubLogins(value: string | undefined): Map<string, string> {
  const logins = new Map<string, string>();
  for (const entry of (value ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0)) {
    const match = /^([^=\s]+)\s*=\s*(\S+)$/.exec(entry);
    if (!match) throw new Error(`GITHUB_LOGINS: '${entry}' is not login=teammate`);
    logins.set(match[1]!.toLowerCase(), match[2]!);
  }
  return logins;
}

/** `GITHUB_LOGINS` for a team file's `github_logins`. */
export function formatGithubLogins(logins: Readonly<Record<string, string>>): string {
  return Object.entries(logins)
    .map(([login, teammate]) => `${login}=${teammate}`)
    .join(",");
}

/** The teammate id for a GitHub login, if it is mapped. */
export function teammateForLogin(logins: ReadonlyMap<string, string>, login: string): string | undefined {
  return logins.get(login.toLowerCase());
}
