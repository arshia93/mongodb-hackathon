// Mongo read/write helpers for the four collections in @preflight/core's schemas.
import { randomUUID } from "node:crypto";

import { type Db } from "mongodb";

import { Result, Run, Target } from "@preflight/core";

type StringIdDoc = { _id?: string; [field: string]: unknown };

export type NewTarget = Omit<Target, "_id" | "createdAt">;

export async function insertTarget(db: Db, target: NewTarget): Promise<string> {
  const _id = `tgt_${randomUUID()}`;
  await db.collection<StringIdDoc>("targets").insertOne({ ...target, _id, createdAt: new Date() });
  return _id;
}

export async function findTarget(db: Db, _id: string): Promise<Target | null> {
  const doc = await db.collection<StringIdDoc>("targets").findOne({ _id });
  return doc ? Target.parse(doc) : null;
}

export async function insertRun(db: Db, run: Run & { _id: string }): Promise<void> {
  await db.collection<StringIdDoc>("runs").insertOne(run);
}

export async function findRun(db: Db, _id: string): Promise<Run | null> {
  const doc = await db.collection<StringIdDoc>("runs").findOne({ _id });
  return doc ? Run.parse(doc) : null;
}

export async function updateRun(db: Db, _id: string, patch: Partial<Run>): Promise<void> {
  await db.collection<StringIdDoc>("runs").updateOne({ _id }, { $set: patch });
}

export async function insertResults(db: Db, results: Result[]): Promise<void> {
  if (results.length === 0) return;
  await db.collection<StringIdDoc>("results").insertMany(results);
}

export async function findResults(db: Db, runId: string): Promise<Result[]> {
  const docs = await db.collection<StringIdDoc>("results").find({ runId }).toArray();
  return docs.map((doc) => Result.parse(doc));
}
