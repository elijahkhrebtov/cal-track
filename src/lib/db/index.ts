import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDatabase() {
  const connectionString = process.env.NEON_PG_CONNECTION_STRING;
  if (!connectionString)
    throw new Error("NEON_PG_CONNECTION_STRING is not configured.");
  return drizzle(neon(connectionString), { schema });
}

let database: ReturnType<typeof createDatabase> | undefined;

export function getDb() {
  return (database ??= createDatabase());
}
