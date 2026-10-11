// Node-only: reads job files from disk. Import via "@preflight/core/job", not the index (keeps fs out of client bundles).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoutine, type Job } from "./environment";

const DEFAULT_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

// Job ids are routine file names, so reject anything that could walk out of routines/.
const JOB_ID = /^[a-z0-9]+(-[a-z0-9]+)*(--[a-z0-9]+(-[a-z0-9]+)*)?$/;

export function listJobs(root = DEFAULT_ROOT): string[] {
  return readdirSync(join(root, "environment_plus_routines/routines"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => basename(f, ".md"))
    .sort();
}

// root is the repo root: the routine's Environment: path is relative to it.
export function loadJob(id: string, root = DEFAULT_ROOT): Job {
  if (!JOB_ID.test(id)) throw new Error(`Invalid job id: ${id}`);
  const file = join(root, "environment_plus_routines/routines", `${id}.md`);
  if (!existsSync(file)) throw new Error(`Job not found: ${id}`);
  const routine = parseRoutine(readFileSync(file, "utf8"));
  // The file name prefix must be correct (environment_plus_routines/README.md), which also pins the path.
  const expected = `environment_plus_routines/environments/${id.split("--")[0]}.md`;
  if (routine.environmentPath !== expected) {
    throw new Error(`Job ${id}: expected "Environment: ${expected}", got "${routine.environmentPath}"`);
  }
  const environment = readFileSync(join(root, routine.environmentPath), "utf8").trim();
  return { id, ...routine, environment };
}
