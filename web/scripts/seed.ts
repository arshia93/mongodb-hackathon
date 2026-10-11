import { MongoClient } from "mongodb";

import { seed } from "../lib/seed";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
await client.connect();
await seed(client.db("preflight"));
await client.close();
console.log("seeded synthetic data");
