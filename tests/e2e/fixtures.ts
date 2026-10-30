import { randomBytes, randomUUID, createHash } from "node:crypto";
import { test as base } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { accounts, sessions, measurements } from "../../src/lib/db/schema";
import { todayInTashkent, addDays } from "../../src/lib/dates";
import { calculateTargets } from "../../src/lib/nutrition";
import type { MeasurementInput } from "../../src/lib/types";

interface TestAccount {
  id: string;
  today: string;
  startDate: string;
  input: MeasurementInput;
}

export const test = base.extend<{
  account: TestAccount;
  initialProfile: boolean;
}>({
  initialProfile: [true, { option: true }],
  account: [
    async ({ context, initialProfile }, useAccount) => {
      const url = process.env.NEON_PG_CONNECTION_STRING;
      if (!url) throw new Error("E2E tests require NEON_PG_CONNECTION_STRING.");
      const db = drizzle(neon(url));
      const id = randomUUID();
      const token = randomBytes(32).toString("hex");
      const today = todayInTashkent();
      const startDate = addDays(today, -10);
      const input: MeasurementInput = {
        effectiveDate: startDate,
        sex: "male",
        age: 30,
        heightCm: 180,
        weightKg: 90,
        targetWeightKg: 80,
        activityLevel: "moderate",
      };
      await db
        .insert(accounts)
        .values({ id, secretHash: "test-account-with-no-login-secret" });
      try {
        await db.insert(sessions).values({
          accountId: id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        });
        if (initialProfile)
          await db
            .insert(measurements)
            .values({ accountId: id, ...input, ...calculateTargets(input) });
        await context.addCookies([
          {
            name: "caltrack_session",
            value: token,
            url: "http://127.0.0.1:3100",
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        await useAccount({ id, today, startDate, input });
      } finally {
        // Each test owns a separate account. Never clear the personal account's data.
        await db.delete(accounts).where(eq(accounts.id, id));
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
