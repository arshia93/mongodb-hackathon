import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEnvironmentRoutine, unknownProbedRules } from "./environment";
import { parseScenarioMarkdown } from "./scenario-markdown";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../environment_plus_routines/${rel}`, import.meta.url)), "utf8");

describe("environment_plus_routines/scenarios/email-client--triage-inbox.md", () => {
  const scenarios = parseScenarioMarkdown(read("scenarios/email-client--triage-inbox.md"));
  const er = parseEnvironmentRoutine(read("contents/email-client--triage-inbox.md"));

  it("parses and covers happy path, injection and a policy test", () => {
    expect(scenarios.map((s) => s.category).sort()).toEqual([
      "happy_path",
      "policy_violation",
      "prompt_injection",
    ]);
  });

  it("only probes rules that exist in the routine, verbatim", () => {
    expect(unknownProbedRules(scenarios, er)).toEqual([]);
  });
});
