// Which cards the AI teammate may pick. The rules are pure and live in
// @workbench/shared (eligibility.ts), so the MCP server uses them without
// depending on the API; this module re-exports them for the API's callers.
// SESSION_MODES, the modes the AI works in from an agent session, lives in
// shared chain.ts so the board's batch selection reads the same list.
export {
  checkEligibility,
  SESSION_MODES,
  TEAMMATE_MODES,
  workableMode,
  type Eligibility,
  type HumanTeammate,
} from "@workbench/shared";
