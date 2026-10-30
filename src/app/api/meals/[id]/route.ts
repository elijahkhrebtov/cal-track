import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { api, assertSameOrigin, json } from "@/lib/http";
import { deleteMeal } from "@/lib/repository";

export const DELETE = api(async (request) => {
  assertSameOrigin(request);
  const accountId = await requireAccount();
  const id = z.uuid().parse(new URL(request.url).pathname.split("/").pop());
  await deleteMeal(accountId, id);
  return json({ ok: true });
});
