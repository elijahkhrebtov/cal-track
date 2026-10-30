import { requireAccount } from "@/lib/auth";
import { z } from "zod";
import { api, HttpError, json } from "@/lib/http";
import { searchExternalFoods } from "@/lib/providers";

export const GET = api(async (request) => {
  await requireAccount();
  const params = new URL(request.url).searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .parse(params.get("page") ?? 1);
  const query = (params.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 2)
    return json({ foods: [], warnings: [], nextPage: null });
  const result = await searchExternalFoods(query, page);
  if (result.warnings.length)
    throw new HttpError(502, result.warnings.join(" "));
  return json(result);
});
