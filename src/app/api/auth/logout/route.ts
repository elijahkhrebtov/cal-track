import { logout } from "@/lib/auth";
import { api, assertSameOrigin, json } from "@/lib/http";

export const POST = api(async (request) => {
  assertSameOrigin(request);
  await logout();
  return json({ ok: true });
});
