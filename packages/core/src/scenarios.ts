// Scenario set = the JSON the planner returns and the format of hand-authored scenario files:
//   { "scenarios": [ { category, title, state, firstInput, successCriteria, ... } ] }
import { z } from "zod";
import { parseModelJson } from "./json";
import {
  Category,
  requireRulesForPolicyViolation,
  Scenario,
  ScenarioShape,
  type ScenarioSource,
} from "./schemas";

export const PlannedScenario = ScenarioShape.omit({
  _id: true,
  jobId: true,
  source: true,
}).superRefine(requireRulesForPolicyViolation);
export type PlannedScenario = z.infer<typeof PlannedScenario>;

export const ScenarioSet = z.object({ scenarios: z.array(PlannedScenario).min(1) });
export type ScenarioSet = z.infer<typeof ScenarioSet>;

export function parseScenarioSet(text: string): ScenarioSet {
  return parseModelJson(text, ScenarioSet, "scenario set");
}

export function toScenario(
  planned: PlannedScenario,
  jobId: string,
  source: ScenarioSource = "planner",
): Scenario {
  return Scenario.parse({ ...planned, jobId, source });
}

export function missingCategories(
  scenarios: { category: Category }[],
  required: readonly Category[] = Category.options,
): Category[] {
  const present = new Set(scenarios.map((s) => s.category));
  return required.filter((c) => !present.has(c));
}
