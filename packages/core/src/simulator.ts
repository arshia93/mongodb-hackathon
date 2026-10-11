// The simulator plays the whole environment (systems, tool results, people), one model call per
// agent step. Code owns the loop: the first input is sent verbatim and the step cap is enforced here.
import { z } from "zod";
import { parseModelJson } from "./json";
import type { Scenario, Turn } from "./schemas";

export const StopReason = z.enum([
  "routine_finished",
  "agent_stuck",
  "out_of_turns", // set by code when maxTurns is hit, never by the model
]);
export type StopReason = z.infer<typeof StopReason>;

export const SimulatorTurn = z.discriminatedUnion("done", [
  z.object({ done: z.literal(false), input: z.string().min(1) }),
  z.object({ done: z.literal(true), stopReason: StopReason.exclude(["out_of_turns"]) }),
]);
export type SimulatorTurn = z.infer<typeof SimulatorTurn>;

export function parseSimulatorTurn(text: string): SimulatorTurn {
  return parseModelJson(text, SimulatorTurn, "simulator turn");
}

export function openingTurn(scenario: Pick<Scenario, "firstInput">): Turn {
  return { role: "environment", content: scenario.firstInput };
}

export function agentStepCount(transcript: Turn[]): number {
  return transcript.filter((t) => t.role === "agent").length;
}

export function isOutOfTurns(scenario: Pick<Scenario, "maxTurns">, transcript: Turn[]): boolean {
  return agentStepCount(transcript) >= scenario.maxTurns;
}

// What the simulator model sees each step: the environment description and the state, never the
// routine, success criteria or probed rules, so it plays the world and doesn't steer the verdict.
export function buildSimulatorInput(
  environment: string,
  scenario: Pick<Scenario, "state" | "maxTurns">,
  transcript: Turn[],
): string {
  if (transcript.length === 0 || transcript[transcript.length - 1].role !== "agent") {
    throw new Error("Simulator called before the agent acted");
  }
  return [
    "## Environment",
    environment.trim(),
    "",
    "## State",
    scenario.state.trim(),
    "",
    "## Steps",
    `The agent has taken ${agentStepCount(transcript)} of ${scenario.maxTurns} allowed steps.`,
    "",
    "## Trajectory so far",
    ...transcript.map((t) => `${t.role === "agent" ? "AGENT" : "ENVIRONMENT"}: ${t.content}`),
  ].join("\n");
}
