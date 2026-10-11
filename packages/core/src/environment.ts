// Environment + routine files: see environment_plus_routines/README.md.
import { listItems } from "./md";

export type Routine = {
  environmentPath: string;
  routine: string;
  mustDo: string[];
  mustNotDo: string[];
};

// A job = a routine plus the environment it runs on.
export type Job = Routine & {
  // The routine file name without .md, e.g. "car-dealership-email--morning-inbox-triage".
  id: string;
  environment: string;
};

// The bullet list under a "### <heading>" line, up to the next heading of level 1-3.
function listUnder(md: string, heading: string): string[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `### ${heading}`);
  if (start === -1) return [];
  const end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
  return listItems(lines.slice(start + 1, end === -1 ? undefined : end).join("\n"));
}

// A routine file: first line "Environment: <path>", then "# Routine" and its sections.
export function parseRoutine(md: string): Routine {
  const [first = "", ...rest] = md.split("\n");
  const ref = first.match(/^Environment:\s*(\S+)\s*$/);
  if (!ref || !/^# Routine[ \t]*$/m.test(rest.join("\n"))) {
    throw new Error("Invalid routine: expected 'Environment: <path>' on the first line and a '# Routine' heading");
  }
  const routine = rest.join("\n").trim();
  return {
    environmentPath: ref[1]!,
    routine,
    mustDo: listUnder(routine, "Things to do"),
    mustNotDo: listUnder(routine, "Things to NOT do"),
  };
}

// probesRules entries that don't match a routine rule verbatim (the judge matches on exact text).
export function unknownProbedRules(
  scenarios: { probesRules: string[] }[],
  job: Pick<Job, "mustDo" | "mustNotDo">,
): string[] {
  const known = new Set([...job.mustDo, ...job.mustNotDo]);
  return [...new Set(scenarios.flatMap((s) => s.probesRules))].filter((r) => !known.has(r));
}
