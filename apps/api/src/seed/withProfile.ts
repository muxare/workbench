// For tests: seed data in which one person has another process profile. A
// profile is the person's `mode_changed` events, so their events are taken out
// and new ones, each from the default, are added at the end of the stream.
import type { ProcessProfile } from "@workbench/shared";
import { profileEvents, type SeedData } from "../store.ts";

export function withProfile(data: SeedData, teammateId: string, profile: ProcessProfile): SeedData {
  const kept = data.events.filter((e) => !(e.type === "mode_changed" && e.teammate_id === teammateId));
  const at = kept.at(-1)?.at ?? "2026-01-01T00:00:00Z";
  return { ...data, events: [...kept, ...profileEvents(teammateId, profile, at, "test-mode-")] };
}
