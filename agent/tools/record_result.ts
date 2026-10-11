// Store one graded transcript against a run.
import { JudgeOutput, Result, Turn } from "@preflight/core";
import { z } from "zod";
import { findRun, insertResult } from "./store";

export const ResultInput = z.object({
  scenarioId: z.string(),
  transcript: z.array(Turn).min(1),
  judge: JudgeOutput,
});

export async function recordResult(runId: string, input: z.input<typeof ResultInput>): Promise<Result> {
  if (!(await findRun(runId))) throw new Error(`run not found: ${runId}`);
  return insertResult({ runId, ...ResultInput.parse(input) });
}
