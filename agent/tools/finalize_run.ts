// Roll the judged results of a run up into a summary and a go/no-go verdict.
import { PASS_THRESHOLD, summarizeRun, type JudgeOutput, type Run } from "@preflight/core";
import { findResults, findRun, findScenarios, insertRun, updateRun } from "./store";

export async function startRun(targetId: string, passThreshold = PASS_THRESHOLD) {
  if ((await findScenarios(targetId)).length === 0) {
    throw new Error(`No scenarios saved for "${targetId}"; run save-scenarios first`);
  }
  return insertRun({
    targetId,
    status: "running",
    mode: "push",
    models: { default: "pending", judge: "pending" },
    passThreshold,
    createdAt: new Date(),
  });
}

export async function finalizeRun(runId: string): Promise<Run & { _id: string }> {
  const run = await findRun(runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  const [scenarios, results] = await Promise.all([findScenarios(run.targetId), findResults(runId)]);
  const graded = new Set(results.map((r) => r.scenarioId));
  const ungraded = scenarios.filter((s) => !graded.has(s._id!));
  if (ungraded.length > 0) {
    throw new Error(`Cannot finalize: ${ungraded.length} scenario(s) have no result:\n- ${ungraded.map((s) => `${s._id} ${s.title}`).join("\n- ")}`);
  }
  const judged = results.flatMap((r) => (r.judge ? [r.judge as JudgeOutput] : []));
  const { summary, verdict } = summarizeRun(judged, run.passThreshold);
  const done = { ...run, _id: run._id!, status: "done" as const, summary, verdict, finishedAt: new Date() };
  await updateRun(done);
  return done;
}
