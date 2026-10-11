import { MongoClient } from "mongodb";
import type { Result, Run } from "@preflight/core";

type StringIdDoc = { _id?: string; [field: string]: unknown };

export async function persistRun(
  uri: string,
  run: Run & { _id: string },
  results: Result[],
): Promise<void> {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db("preflight");
    const { pullState, ...runDoc } = run;
    await db.collection<StringIdDoc>("runs").insertOne(runDoc);
    if (pullState?.scenarios.length) await db.collection<StringIdDoc>("scenarios").insertMany(pullState.scenarios);
    if (results.length) await db.collection<StringIdDoc>("results").insertMany(results);
  } finally {
    await client.close();
  }
}
