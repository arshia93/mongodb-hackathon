// Persist the scenarios the planner wrote (scenario markdown or a JSON scenario set).
import {
  missingCategories,
  parseScenarios,
  toScenario,
  unknownProbedRules,
  type Category,
  type Scenario,
} from "@preflight/core";
import { loadTarget } from "./load_target";
import { insertScenarios } from "./store";

export async function saveScenarios(
  targetId: string,
  plannerOutput: string,
): Promise<{ scenarios: Scenario[]; missingCategories: Category[] }> {
  const target = await loadTarget(targetId);
  const planned = parseScenarios(plannerOutput);
  const unknown = unknownProbedRules(planned, target);
  if (unknown.length > 0) {
    throw new Error(`Rules probed that are not in the routine (copy them verbatim):\n- ${unknown.join("\n- ")}`);
  }
  const scenarios = await insertScenarios(targetId, planned.map((p) => toScenario(p, targetId)));
  return { scenarios, missingCategories: missingCategories(scenarios) };
}
