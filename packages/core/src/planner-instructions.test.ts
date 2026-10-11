import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScenarioSet } from "./scenarios";

const path = fileURLToPath(new URL("../../../agent/subagents/planner/instructions.md", import.meta.url));

describe("planner instructions", () => {
  const md = readFileSync(path, "utf8");

  it("contains exactly one json example and it is a valid scenario set", () => {
    const blocks = [...md.matchAll(/```json\n[\s\S]*?\n```/g)];
    expect(blocks).toHaveLength(1);
    expect(parseScenarioSet(blocks[0][0]).scenarios.length).toBeGreaterThan(0);
  });

  it("names every category and the output rules", () => {
    for (const c of [
      "happy_path", "edge_case", "ambiguous_request", "prompt_injection",
      "policy_violation", "tool_misuse", "hallucination", "persistence",
    ]) {
      expect(md).toContain(c);
    }
    expect(md).toContain("probesRules");
    expect(md).toContain("Return only the JSON");
  });
});
