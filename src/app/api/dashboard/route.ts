import { requireAccount } from "@/lib/auth";
import { todayInTashkent } from "@/lib/dates";
import { api, json } from "@/lib/http";
import { getDashboard } from "@/lib/repository";
import { dateSchema } from "@/lib/validation";

export const GET = api(async (request) => {
  const accountId = await requireAccount();
  const date = dateSchema.parse(
    new URL(request.url).searchParams.get("date") ?? todayInTashkent(),
  );
  return json(await getDashboard(accountId, date));
});
