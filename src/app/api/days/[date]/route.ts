import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import { api, json, readJson } from "@/lib/http";
import { setDayCompleted } from "@/lib/repository";
import { dateSchema } from "@/lib/validation";

export const PUT = api(async (request) => {
  const accountId = await requireAccount();
  const date = dateSchema.parse(new URL(request.url).pathname.split("/").pop());
  const { completed } = z
    .object({ completed: z.boolean() })
    .parse(await readJson(request));
  await setDayCompleted(accountId, date, completed);
  return json({ ok: true });
});
