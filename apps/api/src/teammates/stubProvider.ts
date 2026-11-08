// A deterministic provider for tests and the demo. It calls no model. Its
// output is built only from the function definition read from process/: the
// note quotes the protocol's note for the mode, and the question asks about the
// function's tacit knowledge, which is by definition what only a person knows.
// Every text it writes is marked invented.
import type { TeammateProvider, WorkContext, WorkStep } from "./provider.ts";

export const stubProvider: TeammateProvider = {
  name: "stub",
  work(context: WorkContext): Promise<WorkStep> {
    const { definition, mode, protocol, log, owner, self } = context;
    const inputs = definition.inputs.map((i) => i.artifact).join(", ") || "no inputs";
    const note = [
      `Invented stub: read ${inputs} for "${definition.title}" in ${mode} mode.`,
      protocol.note ?? "",
    ]
      .join(" ")
      .trim();

    // Ask about the next tacit item the AI has not yet asked about on this card.
    const asked = log.filter((e) => e.type === "asked" && e.actor === self.id).length;
    const tacit = definition.tacit ?? [];
    const topic = tacit.length > 0 ? tacit[asked % tacit.length] : definition.summary;
    return Promise.resolve({
      note,
      question: {
        asked_of: owner.id,
        text: `Invented stub: what should I know here? ${topic}`,
        why_it_blocks: `Invented stub: this is tacit knowledge for ${definition.name}, so only a person can say it.`,
      },
    });
  },
};
