import { type Db } from "mongodb";

import { results, runs, scenarios, targets } from "./synthetic";

export async function seed(db: Db): Promise<void> {
  const collections = [
    { name: "targets", docs: targets },
    { name: "scenarios", docs: scenarios },
    { name: "runs", docs: runs },
    { name: "results", docs: results },
  ] as const;
  for (const { name, docs } of collections) {
    await db.collection<{ _id?: string }>(name).bulkWrite(
      docs.map((doc) => ({
        replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
      })),
    );
  }
}
