import { requireAccount } from "@/lib/auth";
import { z } from "zod";
import { api, json, readJson } from "@/lib/http";
import { listFoods, saveCustomFood } from "@/lib/repository";
import { customFoodSchema } from "@/lib/validation";

export const GET = api(async (request) => {
  const accountId = await requireAccount();
  const params = new URL(request.url).searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .parse(params.get("page") ?? 1);
  return json(
    await listFoods(
      accountId,
      params.get("q") ?? "",
      params.get("custom") === "true",
      page,
    ),
  );
});

export const POST = api(async (request) => {
  const accountId = await requireAccount();
  return json(
    await saveCustomFood(
      accountId,
      customFoodSchema.parse(await readJson(request)),
    ),
    201,
  );
});
