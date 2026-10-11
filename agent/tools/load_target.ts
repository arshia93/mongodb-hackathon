// Read a target (an environment + routine pair) from environment_plus_routines/.
// The target id is the routine file name without .md; core's loadJob follows the routine's
// "Environment:" line and extracts the rules.
import { fileURLToPath } from "node:url";
import { loadJob } from "@preflight/core/job";
import type { Job } from "@preflight/core";

export type Target = Job;

export const repoRoot = () => process.env.PREFLIGHT_REPO_ROOT ?? fileURLToPath(new URL("../..", import.meta.url));

export async function loadTarget(jobId: string): Promise<Target> {
  return loadJob(jobId, repoRoot());
}
