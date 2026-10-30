import { z } from "zod";
import { login } from "@/lib/auth";
import { api, json, readJson } from "@/lib/http";

export const POST = api(async (request) => {
  const { secret } = z
    .object({ secret: z.string().min(1).max(2_048) })
    .parse(await readJson(request));
  await login(secret, request);
  return json({ ok: true });
});
