import { type Db, MongoClient } from "mongodb";

import { MONGODB_URI } from "./config";

const DB_NAME = "preflight";

let client: MongoClient | undefined;

export function getDb(): Db {
  client ??= new MongoClient(MONGODB_URI!);
  return client.db(DB_NAME);
}
