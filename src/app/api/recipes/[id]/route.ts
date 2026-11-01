import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { api, assertSameOrigin, json } from "@/lib/http";
import { deleteRecipe, getRecipe } from "@/lib/repository";

function recipeId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").pop());
}

export const GET = api(async (request) => {
  const accountId = await requireAccount();
  return json(await getRecipe(accountId, recipeId(request)));
});

export const DELETE = api(async (request) => {
  assertSameOrigin(request);
  const accountId = await requireAccount();
  await deleteRecipe(accountId, recipeId(request));
  return json({ ok: true });
});
