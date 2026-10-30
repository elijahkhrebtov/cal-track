import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

const url = process.env.NEON_PG_CONNECTION_STRING;
if (!url) throw new Error("Set NEON_PG_CONNECTION_STRING before migrating.");

try {
  const sql = neon(url);
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
  const rows =
    await sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`;
  const lastApplied = rows[0] ? Number(rows[0].created_at) : -1;
  const pending = readMigrationFiles({ migrationsFolder: "./drizzle" }).filter(
    (migration) => migration.folderMillis > lastApplied,
  );
  for (const migration of pending) {
    // Neon HTTP's standard Drizzle migrator executes statements separately.
    // Apply each generated migration and its journal entry in one transaction instead.
    await sql.transaction([
      ...migration.sql
        .filter((statement) => statement.trim())
        .map((statement) => sql.query(statement)),
      sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`,
    ]);
  }
  console.log("Database migrations applied.");
} catch {
  console.error(
    "Migration failed. Check the database connection and migration history.",
  );
  process.exitCode = 1;
}
