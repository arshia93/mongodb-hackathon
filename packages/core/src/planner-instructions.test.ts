import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScenarioMarkdown } from "./scenario-markdown";

const path = fileURLToPath(new URL("../../../agent/subagents/planner/instructions.md", import.meta.url));

describe("planner instructions", () => {
  const md = readFileSync(path, "utf8");

  it("has exactly one markdown example and it is valid scenario markdown", () => {
    const blocks = [...md.matchAll(/```markdown\n[\s\S]*?\n```/g)];
    expect(blocks).toHaveLength(1);
    expect(parseScenarioMarkdown(blocks[0][0]).length).toBeGreaterThan(0);
  });

  it("names every category, every section and the output rule", () => {
    for (const c of [
      "happy_path", "edge_case", "ambiguous_request", "prompt_injection",
      "policy_violation", "tool_misuse", "hallucination", "persistence",
      "## State", "## First input", "## Success criteria", "## Rules probed",
    ]) {
      expect(md).toContain(c);
    }
    expect(md).toContain("Return only the scenarios");
    expect(md).not.toContain("persona");
  });
});
