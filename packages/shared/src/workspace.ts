// How a card is linked to its work in a GitHub repository (docs/dev-loop.md,
// "How the workbench and GitHub talk"): the branch is
// `wb/<card id>-<short title>`, and the pull request body carries the line
// `Workbench: #<card id>`. The API's webhook endpoint reads both to find the
// card a delivery is about, and the MCP server uses the same rules to tell an
// agent session what to name its branch, so the two cannot drift apart.

/** The prefix of every card branch. */
export const CARD_BRANCH_PREFIX = "wb/";

/** The card a branch names: `wb/<card id>-<short title>`, card ids being numbers. */
export function cardIdFromBranch(branch: string): string | undefined {
  return /^wb\/(\d+)-./.exec(branch)?.[1];
}

/** The card a pull request body names with a line such as `Workbench: #12`. */
export function cardIdFromBody(body: string | null): string | undefined {
  return body === null ? undefined : /\bWorkbench:\s*#(\d+)\b/.exec(body)?.[1];
}

/** The line a pull request body carries so the board links it to card `cardId`. */
export function pullRequestBodyLine(cardId: string): string {
  return `Workbench: #${cardId}`;
}

/** Longest short title a suggested branch gets, so branch names stay readable. */
const SLUG_MAX = 40;

/**
 * The branch to suggest for a card: `wb/<id>-<short title>`, the title in
 * lower case with every run of other characters turned into one hyphen and
 * cut at a word boundary. Only a card whose id is a plain number gets one,
 * because only such ids can be read back from a branch (`cardIdFromBranch`).
 */
export function branchForCard(card: { id: string; title: string }): string | undefined {
  if (!/^\d+$/.test(card.id)) return undefined;
  const words = card.title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
  let slug = "";
  for (const word of words) {
    const next = slug === "" ? word : `${slug}-${word}`;
    if (next.length > SLUG_MAX) break;
    slug = next;
  }
  if (slug === "") slug = (words[0] ?? "work").slice(0, SLUG_MAX);
  return `${CARD_BRANCH_PREFIX}${card.id}-${slug}`;
}
