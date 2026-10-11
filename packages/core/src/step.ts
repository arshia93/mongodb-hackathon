// One pull-mode step of a run: pure, so state lives in the Run document between calls (serverless has
// no memory). The caller loads the run, calls stepRun, then persists the returned run and result.
import type { Job } from "./environment";
import { judgeOutputFor, buildJudgeInput, parseJudgeReply, summarizeRun } from "./judge";
import type { StepResult } from "./runner";
import { parseScenarios } from "./scenario-markdown";
import { toScenario } from "./scenarios";
import type { Result, Run, Turn } from "./schemas";
import {
  buildSimulatorInput,
  isOutOfTurns,
  openingTurn,
  parseSimulatorTurn,
  type StopReason,
} from "./simulator";

// Each takes the user-message input and returns the model's raw text; the implementation owns the
// system prompt (agent/subagents/<role>/instructions.md) and the model choice.
export type Models = {
  planner: (input: string) => Promise<string>;
  simulator: (input: string) => Promise<string>;
  judge: (input: string) => Promise<string>;
};

export const DEFAULT_SCENARIO_COUNT = 8;

export function buildPlannerInput(job: Pick<Job, "environment" | "routine">, count: number): string {
  return [`Write ${count} scenarios.`, "", job.environment.trim(), "", "# Routine", job.routine.trim()].join("\n");
}

export type StepOutcome = {
  run: Run & { _id: string };
  result: StepResult;
  // Set when this step finished a scenario: store it in the results collection.
  finished?: Result & { _id: string };
  stopReason?: StopReason;
};

// reply is omitted on the first call (it plans and returns the first message) and required after.
// Throws without side effects on bad model output, so the caller can retry the same step.
export async function stepRun(
  run: Run & { _id: string },
  job: Job,
  models: Models,
  reply?: string,
  count = DEFAULT_SCENARIO_COUNT,
): Promise<StepOutcome> {
  if (run.status === "done" || run.status === "error") throw new Error(`Run ${run._id} is already ${run.status}`);

  const state = run.pullState;
  if (!state) {
    if (reply !== undefined) throw new Error("The first step takes no reply");
    const planned = parseScenarios(await models.planner(buildPlannerInput(job, count)));
    const scenarios = planned.map((p, i) => ({ ...toScenario(p, run.jobId), _id: `${run._id}_s${i}` }));
    const message = openingTurn(scenarios[0]).content;
    return {
      run: {
        ...run,
        status: "running",
        pullState: { scenarios, scenarioIndex: 0, transcript: [openingTurn(scenarios[0])], results: [], pendingMessage: message },
      },
      result: { done: false, message },
    };
  }

  if (reply === undefined || state.pendingMessage === undefined) {
    throw new Error("Expected the agent's reply to the pending message");
  }
  const scenario = state.scenarios[state.scenarioIndex];
  const transcript: Turn[] = [...state.transcript, { role: "agent", content: reply }];

  let stopReason: StopReason;
  if (isOutOfTurns(scenario, transcript)) {
    stopReason = "out_of_turns";
  } else {
    const turn = parseSimulatorTurn(await models.simulator(buildSimulatorInput(job.environment, scenario, transcript)));
    if (!turn.done) {
      return {
        run: { ...run, pullState: { ...state, transcript: [...transcript, { role: "environment", content: turn.input }], pendingMessage: turn.input } },
        result: { done: false, message: turn.input },
      };
    }
    stopReason = turn.stopReason;
  }

  const judge = judgeOutputFor(parseJudgeReply(await models.judge(buildJudgeInput(scenario, job, transcript))), scenario);
  const finished = { _id: `${scenario._id}_r`, runId: run._id, scenarioId: scenario._id!, transcript, judge };
  const results = [...state.results, judge];
  const next = state.scenarioIndex + 1;

  if (next < state.scenarios.length) {
    const message = openingTurn(state.scenarios[next]).content;
    return {
      run: {
        ...run,
        pullState: { ...state, scenarioIndex: next, transcript: [openingTurn(state.scenarios[next])], results, pendingMessage: message },
      },
      result: { done: false, message },
      finished,
      stopReason,
    };
  }

  const { summary, verdict } = summarizeRun(results, run.passThreshold);
  return {
    run: { ...run, status: "done", summary, verdict, finishedAt: new Date(), pullState: { ...state, transcript: [], results, pendingMessage: undefined } },
    result: { done: true, runId: run._id },
    finished,
    stopReason,
  };
}
