import { MongoClient } from "mongodb";

import { results, runs, scenarios, targets } from "../lib/synthetic";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const collections = [
  { name: "targets", docs: targets },
  { name: "scenarios", docs: scenarios },
  { name: "runs", docs: runs },
  { name: "results", docs: results },
] as const;

const client = new MongoClient(uri);
await client.connect();
const db = client.db("preflight");
for (const { name, docs } of collections) {
  await db.collection<{ _id?: string }>(name).bulkWrite(
    docs.map((doc) => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
    })),
  );
}
await client.close();
console.log("seeded synthetic data");
