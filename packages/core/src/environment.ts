// Environment + routine files: see environment_plus_routines/README.md.
import { listItems } from "./md";

export type EnvironmentRoutine = {
  environment: string;
  routine: string;
  mustDo: string[];
  mustNotDo: string[];
};

// The bullet list under a "### <heading>" line, up to the next heading of level 1-3.
function listUnder(md: string, heading: string): string[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === `### ${heading}`);
  if (start === -1) return [];
  const end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
  return listItems(lines.slice(start + 1, end === -1 ? undefined : end).join("\n"));
}

export function parseEnvironmentRoutine(md: string): EnvironmentRoutine {
  const env = md.match(/^# Environment[ \t]*$/m);
  const routine = md.match(/^# Routine[ \t]*$/m);
  if (!env || !routine || env.index! > routine.index!) {
    throw new Error("Invalid environment+routine: expected '# Environment' followed by '# Routine'");
  }
  const routineText = md.slice(routine.index! + routine[0].length).trim();
  return {
    environment: md.slice(env.index! + env[0].length, routine.index).trim(),
    routine: routineText,
    mustDo: listUnder(routineText, "Things to do"),
    mustNotDo: listUnder(routineText, "Things to NOT do"),
  };
}

// probesRules entries that don't match a routine rule verbatim (the judge matches on exact text).
export function unknownProbedRules(
  scenarios: { probesRules: string[] }[],
  er: Pick<EnvironmentRoutine, "mustDo" | "mustNotDo">,
): string[] {
  const known = new Set([...er.mustDo, ...er.mustNotDo]);
  return [...new Set(scenarios.flatMap((s) => s.probesRules))].filter((r) => !known.has(r));
}
