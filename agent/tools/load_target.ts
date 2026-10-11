// Read a target (an environment + routine pair) from environment_plus_routines/.
// The target id is the routine file name without .md; the routine's first line names its environment.
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvironmentRoutine, type EnvironmentRoutine } from "@preflight/core";

const ENV_LINE = /^Environment:\s*(\S+)\s*$/;

export type Target = EnvironmentRoutine & { targetId: string; environmentPath: string };

export const repoRoot = () => process.env.PREFLIGHT_REPO_ROOT ?? fileURLToPath(new URL("../..", import.meta.url));

export async function loadTarget(targetId: string): Promise<Target> {
  if (basename(targetId) !== targetId) throw new Error(`Invalid target id: "${targetId}"`);
  const routineMd = await readRoutine(targetId);
  const environmentPath = routineMd.split("\n", 1)[0].match(ENV_LINE)?.[1];
  if (!environmentPath) {
    throw new Error(`${targetId}: first line must be "Environment: <path>"`);
  }
  const environmentMd = await readFile(join(repoRoot(), environmentPath), "utf8").catch(() => {
    throw new Error(`${targetId}: environment file not found: ${environmentPath}`);
  });
  const routineBody = routineMd.slice(routineMd.indexOf("\n") + 1);
  return { targetId, environmentPath, ...parseEnvironmentRoutine(`${environmentMd.trim()}\n\n${routineBody.trim()}\n`) };
}

function readRoutine(targetId: string): Promise<string> {
  return readFile(join(repoRoot(), "environment_plus_routines", "routines", `${targetId}.md`), "utf8").catch(() => {
    throw new Error(`Unknown target "${targetId}": no environment_plus_routines/routines/${targetId}.md`);
  });
}
