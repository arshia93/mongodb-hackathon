import { describe, expect, it } from "vitest";
import type { Job } from "./environment";
import { renderScenarioMarkdown } from "./scenario-markdown";
import { runLocal } from "./run-local";
import type { Models } from "./step";

const job: Job = {
  id: "e--r",
  environmentPath: "environment_plus_routines/environments/e.md",
  environment: "# Environment\nE",
  routine: "# Routine\nR",
  mustDo: [],
  mustNotDo: [],
};
const sc = (title: string) => ({
  category: "happy_path" as const, title, state: "S", firstInput: `go ${title}`,
  successCriteria: ["ok"], maxTurns: 5, probesRules: [],
});

describe("runLocal", () => {
  it("runs every scenario to a verdict and reports each result once", async () => {
    const models: Models = {
      planner: async () => renderScenarioMarkdown([sc("a"), sc("b")]),
      simulator: async () => JSON.stringify({ done: true, stopReason: "routine_finished" }),
      judge: async () => JSON.stringify({ passed: true, score: 9, failed_rules: [], evidence_quote: "q", reasoning: "r", severity: "low" }),
    };
    const seen: Array<[string, boolean, number]> = [];
    const streamed: string[] = [];
    const { run, results } = await runLocal(job, models, async (m, ctx) => (seen.push([m, ctx.firstInScenario, ctx.scenarioIndex]), "done"), {
      onResult: (r) => streamed.push(r.scenarioId),
    });
    expect(seen).toEqual([["go a", true, 0], ["go b", true, 1]]);
    expect(results.map((r) => r.scenarioId)).toEqual(streamed);
    expect(results).toHaveLength(2);
    expect(run).toMatchObject({ status: "done", verdict: "go" });
  });
});
