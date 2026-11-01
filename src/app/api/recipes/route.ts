import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { api, json, readJson } from "@/lib/http";
import { listRecipes, saveRecipe } from "@/lib/repository";
import { recipeSchema } from "@/lib/validation";

export const GET = api(async (request) => {
  const accountId = await requireAccount();
  const params = new URL(request.url).searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .parse(params.get("page") ?? 1);
  return json(await listRecipes(accountId, params.get("q") ?? "", page));
});

export const POST = api(async (request) => {
  const accountId = await requireAccount();
  const input = recipeSchema.parse(await readJson(request));
  return json(await saveRecipe(accountId, input), input.id ? 200 : 201);
});
