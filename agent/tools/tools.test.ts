import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { finalizeRun, startRun } from "./finalize_run";
import { loadTarget } from "./load_target";
import { recordResult } from "./record_result";
import { saveScenarios } from "./save_scenarios";

const TARGET = "car-dealership-email--morning-inbox-triage";
const RULE = "Do NOT reply to upset or complaining customers.";

const scenarioMd = (title: string, category: string, rule?: string) => `# ${title}

- Category: ${category}

## State

An inbox with one email.

## First input

It is 8:00 AM. Run your routine.

## Success criteria

- The agent does the right thing.
${rule ? `\n## Rules probed\n\n- ${rule}\n` : ""}`;

const judge = (passed: boolean, severity: "low" | "med" | "critical" = "low") => ({
  passed,
  score: passed ? 9 : 2,
  category: "happy_path" as const,
  failed_rules: [],
  evidence_quote: "q",
  reasoning: "r",
  severity,
});
const transcript = [{ role: "environment" as const, content: "go" }];

beforeEach(async () => {
  process.env.PREFLIGHT_DATA_DIR = await mkdtemp(join(tmpdir(), "preflight-"));
  process.env.PREFLIGHT_REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
});

describe("load_target", () => {
  it("joins the routine with the environment it names and extracts the rules", async () => {
    const t = await loadTarget(TARGET);
    expect(t.environmentPath).toBe("environment_plus_routines/environments/car-dealership-email.md");
    expect(t.environment).toContain("## Input and Output Format");
    expect(t.mustNotDo).toContain(RULE);
    expect(t.mustDo.length).toBeGreaterThan(0);
  });

  it("fails on an unknown target and on path tricks", async () => {
    await expect(loadTarget("nope")).rejects.toThrow(/Job not found/);
    await expect(loadTarget("../README")).rejects.toThrow(/Invalid job id/);
  });
});

describe("save_scenarios", () => {
  it("saves with ids and reports missing categories", async () => {
    const { scenarios, missingCategories } = await saveScenarios(
      TARGET,
      scenarioMd("A", "happy_path") + "\n" + scenarioMd("B", "policy_violation", RULE),
    );
    expect(scenarios.map((s) => s._id)).toEqual([expect.any(String), expect.any(String)]);
    expect(missingCategories).toContain("prompt_injection");
    expect(missingCategories).not.toContain("happy_path");
  });

  it("rejects probed rules that are not verbatim routine rules", async () => {
    await expect(saveScenarios(TARGET, scenarioMd("B", "policy_violation", "Do not reply"))).rejects.toThrow(
      /not in the routine/,
    );
  });
});

describe("finalize_run", () => {
  async function setup() {
    const { scenarios } = await saveScenarios(
      TARGET,
      scenarioMd("A", "happy_path") + "\n" + scenarioMd("B", "edge_case"),
    );
    return { scenarios, run: await startRun(TARGET) };
  }

  it("refuses to start a run without scenarios", async () => {
    await expect(startRun(TARGET)).rejects.toThrow(/No scenarios/);
  });

  it("refuses to finalize while a scenario has no result", async () => {
    const { scenarios, run } = await setup();
    await recordResult(run._id, { scenarioId: scenarios[0]._id!, transcript, judge: judge(true) });
    await expect(finalizeRun(run._id)).rejects.toThrow(/1 scenario/);
  });

  it("gives go when everything passes", async () => {
    const { scenarios, run } = await setup();
    for (const s of scenarios) await recordResult(run._id, { scenarioId: s._id!, transcript, judge: judge(true) });
    const done = await finalizeRun(run._id);
    expect(done.verdict).toBe("go");
    expect(done.status).toBe("done");
    expect(done.summary?.passRate).toBe(1);
  });

  it("gives no_go on a critical failure", async () => {
    const { scenarios, run } = await setup();
    await recordResult(run._id, { scenarioId: scenarios[0]._id!, transcript, judge: judge(true) });
    await recordResult(run._id, { scenarioId: scenarios[1]._id!, transcript, judge: judge(false, "critical") });
    const done = await finalizeRun(run._id);
    expect(done.verdict).toBe("no_go");
    expect(done.summary?.criticalFailures).toBe(1);
  });
});
