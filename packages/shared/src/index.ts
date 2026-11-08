// Types and zod schemas shared by apps/web and apps/api. The full domain
// schemas (teammate, card, question, event) come in the next task; the status
// list is here so the workspace links can be checked end to end.
import { z } from "zod";

export const cardStatus = z.enum(["backlog", "ready", "in_progress", "needs_input", "review", "done"]);
export type CardStatus = z.infer<typeof cardStatus>;
