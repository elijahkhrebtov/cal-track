import { requireAccount } from "@/lib/auth";
import { api, json } from "@/lib/http";
import { searchExternalFoods } from "@/lib/providers";

export const GET = api(async (request) => {
  await requireAccount();
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 120);
  if (query.length < 2) return json({ foods: [], warnings: [] });
  return json(await searchExternalFoods(query));
});
