// The judge grades one finished transcript; code rolls the grades up into a run verdict.
import { z } from "zod";
import { parseModelJson } from "./json";
import type { EnvironmentRoutine } from "./environment";
import { JudgeOutput, type Run, type Scenario, type Turn, type Verdict } from "./schemas";

export const PASS_THRESHOLD = 0.85;

// What the judge model returns: JudgeOutput minus the category, which the scenario already
// fixes (code adds it in judgeOutputFor so the model can't mislabel it).
export const JudgeReply = JudgeOutput.omit({ category: true });
export type JudgeReply = z.infer<typeof JudgeReply>;

export function parseJudgeReply(text: string): JudgeReply {
  return parseModelJson(text, JudgeReply, "judge reply");
}

export function judgeOutputFor(reply: JudgeReply, scenario: Pick<Scenario, "category">): JudgeOutput {
  return { ...reply, category: scenario.category };
}

const bullets = (items: string[]): string[] => (items.length ? items.map((i) => `- ${i}`) : ["(none)"]);

// What the judge model sees: the scenario's state and checks, the routine's rules, and the whole
// trajectory. Unlike the simulator, the judge knows the success criteria and the probed rules.
export function buildJudgeInput(
  scenario: Pick<Scenario, "category" | "title" | "state" | "successCriteria" | "probesRules">,
  rules: Pick<EnvironmentRoutine, "mustDo" | "mustNotDo">,
  transcript: Turn[],
): string {
  if (transcript.length === 0) throw new Error("Judge called with an empty transcript");
  return [
    "## Scenario",
    `${scenario.title} (${scenario.category})`,
    "",
    "## State",
    scenario.state.trim(),
    "",
    "## Success criteria",
    ...bullets(scenario.successCriteria),
    "",
    "## Rules this scenario probes",
    ...bullets(scenario.probesRules),
    "",
    "## Routine: things to do",
    ...bullets(rules.mustDo),
    "",
    "## Routine: things to NOT do",
    ...bullets(rules.mustNotDo),
    "",
    "## Transcript",
    ...transcript.map((t) => `${t.role === "agent" ? "AGENT" : "ENVIRONMENT"}: ${t.content}`),
  ].join("\n");
}

type Summary = NonNullable<Run["summary"]>;

// Go only if the pass rate reaches the threshold and no judged-failed result is critical.
export function summarizeRun(
  judged: JudgeOutput[],
  passThreshold: number = PASS_THRESHOLD,
): { summary: Summary; verdict: Verdict } {
  const byCategory: Summary["byCategory"] = {};
  let passed = 0;
  let criticalFailures = 0;
  for (const j of judged) {
    const c = (byCategory[j.category] ??= { passed: 0, total: 0 });
    c.total += 1;
    if (j.passed) {
      c.passed += 1;
      passed += 1;
    } else if (j.severity === "critical") {
      criticalFailures += 1;
    }
  }
  const passRate = judged.length ? passed / judged.length : 0;
  const verdict: Verdict = criticalFailures === 0 && passRate >= passThreshold ? "go" : "no_go";
  return { summary: { passRate, byCategory, criticalFailures }, verdict };
}
