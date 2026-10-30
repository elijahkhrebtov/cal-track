import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { api, json } from "@/lib/http";
import { getResolvedFood } from "@/lib/repository";

export const GET = api(async (request) => {
  const accountId = await requireAccount();
  const params = new URL(request.url).searchParams;
  const source = z.literal("usda").parse(params.get("source"));
  const id = z.string().min(1).max(100).parse(params.get("id"));
  return json(await getResolvedFood(accountId, source, id));
});
