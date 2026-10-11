import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSimulatorTurn } from "./simulator";

const path = fileURLToPath(new URL("../../../agent/subagents/simulator/instructions.md", import.meta.url));

describe("simulator instructions", () => {
  const md = readFileSync(path, "utf8");

  it("has one continue and one stop example, both valid", () => {
    const turns = [...md.matchAll(/```json\n[\s\S]*?\n```/g)].map((m) => parseSimulatorTurn(m[0]));
    expect(turns).toHaveLength(2);
    expect(turns.map((t) => t.done).sort()).toEqual([false, true]);
  });

  it("names the stop reasons the model may use and the output rule", () => {
    expect(md).toContain("routine_finished");
    expect(md).toContain("agent_stuck");
    expect(md).toContain("Return only the JSON");
  });
});
