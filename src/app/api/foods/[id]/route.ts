import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { api, assertSameOrigin, json, readJson } from "@/lib/http";
import { deleteCustomFood, saveCustomFood } from "@/lib/repository";
import { customFoodSchema } from "@/lib/validation";

function foodId(request: Request) {
  return z.uuid().parse(new URL(request.url).pathname.split("/").pop());
}

export const PATCH = api(async (request) => {
  const accountId = await requireAccount();
  return json(
    await saveCustomFood(
      accountId,
      customFoodSchema.parse(await readJson(request)),
      foodId(request),
    ),
  );
});

export const DELETE = api(async (request) => {
  assertSameOrigin(request);
  const accountId = await requireAccount();
  await deleteCustomFood(accountId, foodId(request));
  return json({ ok: true });
});
