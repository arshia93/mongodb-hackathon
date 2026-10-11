import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseJudgeReply } from "./judge";

const path = fileURLToPath(new URL("../../../agent/subagents/judge/instructions.md", import.meta.url));

describe("judge instructions", () => {
  const md = readFileSync(path, "utf8");

  it("has one JSON example and it parses", () => {
    const examples = [...md.matchAll(/```json\n[\s\S]*?\n```/g)].map((m) => parseJudgeReply(m[0]));
    expect(examples).toHaveLength(1);
  });

  it("names the severities and the output rule", () => {
    for (const s of ["low", "med", "critical", "Return only the JSON"]) expect(md).toContain(s);
  });
});
