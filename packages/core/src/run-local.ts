// Drives stepRun to completion in memory, with the agent under test as a plain function.
// For the CLI and evals; the MCP server instead calls stepRun once per request.
import type { Job } from "./environment";
import type { Result, Run } from "./schemas";
import { DEFAULT_SCENARIO_COUNT, stepRun, type Models } from "./step";

export type AgentUnderTest = (
  message: string,
  // True on the first message of each scenario, so a stateful agent can start a fresh conversation.
  ctx: { firstInScenario: boolean; scenarioIndex: number },
) => Promise<string>;

export async function runLocal(
  job: Job,
  models: Models,
  agent: AgentUnderTest,
  opts: { count?: number; passThreshold?: number; onResult?: (r: Result) => void } = {},
): Promise<{ run: Run & { _id: string }; results: Result[] }> {
  let run: Run & { _id: string } = {
    _id: `local_${Date.now()}`,
    jobId: job.id,
    status: "queued",
    mode: "pull",
    models: { default: "local", judge: "local" },
    passThreshold: opts.passThreshold ?? 0.85,
  };
  const results: Result[] = [];
  let out = await stepRun(run, job, models, undefined, opts.count ?? DEFAULT_SCENARIO_COUNT);
  let first = true;
  while (!out.result.done) {
    const scenarioIndex = out.run.pullState!.scenarioIndex;
    const reply = await agent(out.result.message, { firstInScenario: first, scenarioIndex });
    out = await stepRun(out.run, job, models, reply);
    first = false;
    if (out.finished) {
      results.push(out.finished);
      opts.onResult?.(out.finished);
      first = true;
    }
  }
  if (out.finished && !results.includes(out.finished)) {
    results.push(out.finished);
    opts.onResult?.(out.finished);
  }
  return { run: out.run, results };
}
