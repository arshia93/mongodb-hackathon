// The one interface the dashboard and MCP server call. The agent (Person 1) implements it.
// Until then, web/ can use a stub that returns fake data.
import type { RunMode } from "./schemas";

export type StepResult =
  | { done: false; message: string } // next simulated-user message for the agent under test
  | { done: true; runId: string }; // run finished; fetch the report

export interface Runner {
  startRun(jobId: string, mode: RunMode, count?: number): Promise<{ runId: string }>;
  // Pull mode only: submit the agent's reply (omit on the first call) and get the next message.
  stepRun(runId: string, reply?: string): Promise<StepResult>;
}
