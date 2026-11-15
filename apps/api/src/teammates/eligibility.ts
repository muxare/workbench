// Which cards the AI teammate may pick. The rules are pure and live in
// @workbench/shared (eligibility.ts), so the MCP server uses them without
// depending on the API; this module re-exports them for the API's callers.
import type { Mode } from "@workbench/shared";

export { checkEligibility, TEAMMATE_MODES, workableMode, type Eligibility, type HumanTeammate } from "@workbench/shared";

/**
 * The modes the AI teammate works in when it works from an agent session,
 * such as Claude Code through the MCP server (apps/mcp), and picks a card with
 * `POST /cards/:id/pick`. There it can write as well as ask, so `delegate` is
 * one of them; `manual` never is, because its protocol gives the AI no part.
 */
export const SESSION_MODES: readonly Mode[] = ["assist", "delegate"];
