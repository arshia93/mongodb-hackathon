// File-backed stand-in for Mongo (checkpoint 1). Same shape as the collections in docs/PLAN2.md,
// so swapping in the real Mongo helpers only means replacing this file.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { repoRoot } from "./load_target";
import type { Result, Run, Scenario } from "@preflight/core";

const root = () => process.env.PREFLIGHT_DATA_DIR ?? join(repoRoot(), ".preflight");

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

export async function insertScenarios(jobId: string, scenarios: Scenario[]): Promise<Scenario[]> {
  const saved = scenarios.map((s) => ({ ...s, _id: newId("scn") }));
  await writeJson(join(root(), "scenarios", `${jobId}.json`), saved);
  return saved;
}

export const findScenarios = (jobId: string) =>
  readJson<Scenario[]>(join(root(), "scenarios", `${jobId}.json`), []);

export async function insertRun(run: Omit<Run, "_id">): Promise<Run & { _id: string }> {
  const saved = { ...run, _id: newId("run") };
  await writeJson(join(root(), "runs", `${saved._id}.json`), saved);
  return saved;
}

export const findRun = (runId: string) => readJson<Run | null>(join(root(), "runs", `${runId}.json`), null);

export async function updateRun(run: Run & { _id: string }): Promise<void> {
  await writeJson(join(root(), "runs", `${run._id}.json`), run);
}

export async function insertResult(result: Omit<Result, "_id">): Promise<Result> {
  const path = join(root(), "results", `${result.runId}.json`);
  const saved = { ...result, _id: newId("res") };
  await writeJson(path, [...(await readJson<Result[]>(path, [])), saved]);
  return saved;
}

export const findResults = (runId: string) => readJson<Result[]>(join(root(), "results", `${runId}.json`), []);
