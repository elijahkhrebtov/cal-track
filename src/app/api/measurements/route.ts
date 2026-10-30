import { asc, eq } from "drizzle-orm";
import { requireAccount } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { measurements } from "@/lib/db/schema";
import { api, json, readJson } from "@/lib/http";
import { saveMeasurement } from "@/lib/repository";
import { measurementSchema } from "@/lib/validation";

export const GET = api(async () => {
  const accountId = await requireAccount();
  const rows = await getDb()
    .select({
      id: measurements.id,
      effectiveDate: measurements.effectiveDate,
      weightKg: measurements.weightKg,
      targetWeightKg: measurements.targetWeightKg,
      maintenance: measurements.maintenance,
      steady: measurements.steady,
      createdAt: measurements.createdAt,
    })
    .from(measurements)
    .where(eq(measurements.accountId, accountId))
    .orderBy(asc(measurements.effectiveDate), asc(measurements.createdAt));
  return json({ measurements: rows });
});

export const POST = api(async (request) => {
  const accountId = await requireAccount();
  const input = measurementSchema.parse(await readJson(request));
  return json(await saveMeasurement(accountId, input), 201);
});
