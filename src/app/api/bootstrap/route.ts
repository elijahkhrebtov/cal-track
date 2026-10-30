import { requireAccount } from "@/lib/auth";
import { api, json } from "@/lib/http";
import { getBootstrap } from "@/lib/repository";

export const GET = api(async () =>
  json(await getBootstrap(await requireAccount())),
);
