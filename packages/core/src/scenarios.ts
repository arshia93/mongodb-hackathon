// Scenario set = the JSON the planner returns and the format of hand-authored scenario files:
//   { "scenarios": [ { category, persona, goal, openingMessage, successCriteria, ... } ] }
import { z } from "zod";
import {
  Category,
  requireRulesForPolicyViolation,
  Scenario,
  ScenarioShape,
  type ScenarioSource,
} from "./schemas";

export const PlannedScenario = ScenarioShape.omit({
  _id: true,
  targetId: true,
  source: true,
}).superRefine(requireRulesForPolicyViolation);
export type PlannedScenario = z.infer<typeof PlannedScenario>;

export const ScenarioSet = z.object({ scenarios: z.array(PlannedScenario).min(1) });
export type ScenarioSet = z.infer<typeof ScenarioSet>;

// Models like to wrap JSON in markdown fences; accept that, nothing more lenient.
function stripFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/);
  return match ? match[1] : text.trim();
}

export function parseScenarioSet(text: string): ScenarioSet {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch (err) {
    throw new Error(`Invalid scenario set: not valid JSON (${(err as Error).message})`);
  }
  const result = ScenarioSet.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid scenario set: ${detail}`);
  }
  return result.data;
}

export function toScenario(
  planned: PlannedScenario,
  targetId: string,
  source: ScenarioSource = "planner",
): Scenario {
  return Scenario.parse({ ...planned, targetId, source });
}

export function missingCategories(
  scenarios: { category: Category }[],
  required: readonly Category[] = Category.options,
): Category[] {
  const present = new Set(scenarios.map((s) => s.category));
  return required.filter((c) => !present.has(c));
}
