import {
  type Run,
  type RunMode,
  type StepResult,
  type Target,
  type Runner,
} from "@preflight/core";
import { randomUUID } from "node:crypto";

import { getDb } from "./db";
import {
  findResults,
  findRun,
  findTarget,
  insertRun,
  insertTarget,
} from "./repository";

export function registerTarget(spec: Omit<Target, "_id" | "createdAt">): Promise<string> {
  return insertTarget(getDb(), spec);
}

export async function getReport(runId: string) {
  const db = getDb();
  const run = await findRun(db, runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  return {
    run,
    results: await findResults(db, runId),
    dashboardPath: `/runs/${runId}`,
  };
}

export const runner: Runner = {
  async startRun(targetId: string, mode: RunMode) {
    const db = getDb();
    if (!(await findTarget(db, targetId))) throw new Error(`target not found: ${targetId}`);
    const _id = `run_${randomUUID()}`;
    const run: Run & { _id: string } = {
      _id,
      targetId,
      status: "queued",
      mode,
      models: { default: "pending", judge: "pending" },
      passThreshold: 0.85,
      createdAt: new Date(),
    };
    await insertRun(db, run);
    return { runId: _id };
  },
  async stepRun(): Promise<StepResult> {
    throw new Error("pull mode is not implemented yet");
  },
};
