import "dotenv/config";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { accounts } from "../src/lib/db/schema";
import { hashSecret } from "../src/lib/password";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const url = process.env.NEON_PG_CONNECTION_STRING;
if (!url) throw new Error("Set NEON_PG_CONNECTION_STRING before seeding.");

try {
  const db = drizzle(neon(url));
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, ACCOUNT_ID))
    .limit(1);
  if (existing) {
    console.log("Personal account already exists. No changes made.");
  } else {
    const secret =
      process.env.APP_LOGIN_SECRET?.trim() ||
      (await readFile("app-login-secret", "utf8")).trim();
    if (!secret || secret.length > 2_048)
      throw new Error("Missing or invalid login secret.");
    await db
      .insert(accounts)
      .values({ id: ACCOUNT_ID, secretHash: await hashSecret(secret) })
      .onConflictDoNothing();
    console.log(
      "Personal account created. Login secret stored as a scrypt hash.",
    );
  }
} catch {
  console.error(
    "Account initialization failed. Check the migrated database and APP_LOGIN_SECRET or app-login-secret.",
  );
  process.exitCode = 1;
}
