import { requireAccount } from "@/lib/auth";
import { api, json, readJson } from "@/lib/http";
import { saveMeal } from "@/lib/repository";
import { mealSchema } from "@/lib/validation";

export const POST = api(async (request) => {
  const accountId = await requireAccount();
  const input = mealSchema.parse(await readJson(request));
  return json(await saveMeal(accountId, input), input.id ? 200 : 201);
});
