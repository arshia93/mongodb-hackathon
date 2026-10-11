// pnpm --filter @preflight/agent run-job <job-id> [scenario-count]
import { loadJob, listJobs } from "@preflight/core/job";
import { runLocal } from "@preflight/core";
import Anthropic from "@anthropic-ai/sdk";
import { createModels } from "./models";
import { createStubAgent } from "./stub-agent";
import { persistRun } from "./persist";

const [jobId, count] = process.argv.slice(2);
if (!jobId) {
  console.error(`usage: run-job <job-id> [scenario-count]\njobs: ${listJobs().join(", ")}`);
  process.exit(1);
}
const job = loadJob(jobId);
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");
const client = new Anthropic();
const { run, results } = await runLocal(job, createModels({ client: client as never }), createStubAgent(job, client), {
  count: count ? Number(count) : undefined,
  onResult: (r) =>
    console.log(`${r.judge?.passed ? "PASS" : "FAIL"} [${r.judge?.category}/${r.judge?.severity}] ${r.scenarioId} (${r.transcript.length} turns): ${r.judge?.reasoning}`),
});
console.log(`\nverdict: ${run.verdict}`, JSON.stringify(run.summary));
await persistRun(uri, run, results);
console.log(`saved run ${run._id} to preflight database`);
