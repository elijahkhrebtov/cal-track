import { requireAccount } from "@/lib/auth";
import { api, json, readJson } from "@/lib/http";
import { listFoods, saveCustomFood } from "@/lib/repository";
import { customFoodSchema } from "@/lib/validation";

export const GET = api(async (request) => {
  const accountId = await requireAccount();
  const params = new URL(request.url).searchParams;
  return json({
    foods: await listFoods(
      accountId,
      params.get("q") ?? "",
      params.get("custom") === "true",
    ),
  });
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
