import { describe, expect, it } from "vitest";
import type { Job } from "./environment";
import { renderScenarioMarkdown } from "./scenario-markdown";
import type { Run } from "./schemas";
import { stepRun, type Models } from "./step";

const job: Job = {
  id: "e--r",
  environmentPath: "environment_plus_routines/environments/e.md",
  environment: "# Environment\nE",
  routine: "# Routine\nR",
  mustDo: ["Do A"],
  mustNotDo: ["Never B"],
};

const planned = (title: string, maxTurns = 5) => ({
  category: "happy_path" as const,
  title,
  state: "S",
  firstInput: `go ${title}`,
  successCriteria: ["ok"],
  maxTurns,
  probesRules: [],
});

const judgeJson = (passed: boolean, severity = "low") =>
  JSON.stringify({ passed, score: passed ? 9 : 2, failed_rules: passed ? [] : ["Never B"], evidence_quote: "q", reasoning: "r", severity });

function fakes(opts: { scenarios: ReturnType<typeof planned>[]; sim: string[]; judge: string[] }): Models & { calls: string[] } {
  const calls: string[] = [];
  const sim = [...opts.sim];
  const judge = [...opts.judge];
  return {
    calls,
    planner: async () => (calls.push("planner"), renderScenarioMarkdown(opts.scenarios)),
    simulator: async () => (calls.push("simulator"), sim.shift()!),
    judge: async () => (calls.push("judge"), judge.shift()!),
  };
}

const newRun = (): Run & { _id: string } => ({
  _id: "run1",
  jobId: "e--r",
  status: "queued",
  mode: "pull",
  models: { default: "m", judge: "m" },
  passThreshold: 0.85,
});

describe("stepRun", () => {
  it("plans on the first call and returns the first input", async () => {
    const m = fakes({ scenarios: [planned("a")], sim: [], judge: [] });
    const out = await stepRun(newRun(), job, m);
    expect(out.result).toEqual({ done: false, message: "go a" });
    expect(out.run.status).toBe("running");
    expect(out.run.pullState?.scenarios[0]._id).toBe("run1_s0");
  });

  it("runs two scenarios to a verdict, one step per call", async () => {
    const m = fakes({
      scenarios: [planned("a"), planned("b")],
      sim: [
        JSON.stringify({ done: false, input: "tool result" }),
        JSON.stringify({ done: true, stopReason: "routine_finished" }),
        JSON.stringify({ done: true, stopReason: "agent_stuck" }),
      ],
      judge: [judgeJson(true), judgeJson(false, "critical")],
    });
    let { run, result } = await stepRun(newRun(), job, m);

    let out = await stepRun(run, job, m, "call tool");
    expect(out.result).toEqual({ done: false, message: "tool result" });
    expect(out.finished).toBeUndefined();

    out = await stepRun(out.run, job, m, "done a");
    expect(out.result).toEqual({ done: false, message: "go b" });
    expect(out.finished).toMatchObject({ runId: "run1", scenarioId: "run1_s0" });
    expect(out.finished!.transcript.map((t) => t.role)).toEqual(["environment", "agent", "environment", "agent"]);
    expect(out.finished!.judge?.category).toBe("happy_path");

    out = await stepRun(out.run, job, m, "done b");
    expect(out.result).toEqual({ done: true, runId: "run1" });
    expect(out.run).toMatchObject({ status: "done", verdict: "no_go" });
    expect(out.run.summary).toMatchObject({ passRate: 0.5, criticalFailures: 1 });
    expect(out.stopReason).toBe("agent_stuck");
  });

  it("ends a scenario at maxTurns without asking the simulator", async () => {
    const m = fakes({ scenarios: [planned("a", 1)], sim: [], judge: [judgeJson(true)] });
    const { run } = await stepRun(newRun(), job, m);
    const out = await stepRun(run, job, m, "x");
    expect(out.stopReason).toBe("out_of_turns");
    expect(out.run.verdict).toBe("go");
    expect(m.calls).toEqual(["planner", "judge"]);
  });

  it("does not mutate the input run, so a failed step can be retried", async () => {
    const m = fakes({ scenarios: [planned("a")], sim: ["not json"], judge: [] });
    const { run } = await stepRun(newRun(), job, m);
    const before = JSON.stringify(run);
    await expect(stepRun(run, job, m, "x")).rejects.toThrow(/Invalid simulator turn/);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("rejects bad call order and finished runs", async () => {
    const m = fakes({ scenarios: [planned("a", 1)], sim: [], judge: [judgeJson(true)] });
    await expect(stepRun(newRun(), job, m, "early")).rejects.toThrow(/no reply/);
    const { run } = await stepRun(newRun(), job, m);
    await expect(stepRun(run, job, m)).rejects.toThrow(/reply to the pending message/);
    const done = (await stepRun(run, job, m, "x")).run;
    await expect(stepRun(done, job, m, "y")).rejects.toThrow(/already done/);
  });
});
