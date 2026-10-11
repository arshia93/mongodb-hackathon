// CLI over the agent tools, backed by .preflight/ files (no Mongo yet). 
//   pnpm --filter @preflight/agent preflight <command> ...
import { readFile } from "node:fs/promises";
import { finalizeRun, startRun } from "../tools/finalize_run";
import { loadTarget } from "../tools/load_target";
import { recordResult } from "../tools/record_result";
import { saveScenarios } from "../tools/save_scenarios";

const USAGE = `Usage:
  preflight load <target>                         print the target's environment and routine rules
  preflight save-scenarios <target> <file>        parse + save planner output (markdown or JSON)
  preflight start-run <target>                    create a run, print its id
  preflight record-result <runId> <file.json>     store {scenarioId, transcript, judge}
  preflight finalize <runId>                      summarize the run and print the verdict`;

const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));

type Command = { args: number; run: (a: string, b: string) => Promise<unknown> };

const commands: Record<string, Command> = {
  load: { args: 1, run: (a) => loadTarget(a) },
  "save-scenarios": {
    args: 2,
    run: async (a, b) => {
      const r = await saveScenarios(a, await readFile(b, "utf8"));
      return {
        saved: r.scenarios.map((s) => ({ id: s._id, category: s.category, title: s.title })),
        missingCategories: r.missingCategories,
      };
    },
  },
  "start-run": { args: 1, run: (a) => startRun(a) },
  "record-result": { args: 2, run: async (a, b) => recordResult(a, JSON.parse(await readFile(b, "utf8"))) },
  finalize: {
    args: 1,
    run: async (a) => {
      const run = await finalizeRun(a);
      process.exitCode = run.verdict === "go" ? 0 : 1;
      return { runId: run._id, verdict: run.verdict, summary: run.summary };
    },
  },
};

async function main([name, ...args]: string[]) {
  const cmd = commands[name];
  if (!cmd || args.length !== cmd.args) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  print(await cmd.run(args[0], args[1]));
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 2;
});
