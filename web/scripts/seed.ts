import { MongoClient } from "mongodb";

import { seedSynthetic } from "@preflight/core";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
await client.connect();
await seedSynthetic(client.db("preflight"));
await client.close();
console.log("seeded synthetic data");
