import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("secret login issues a durable HttpOnly cookie and sign out revokes it", async ({
  request,
}) => {
  expect((await request.get("/api/bootstrap")).status()).toBe(401);
  expect(
    (
      await request.post("/api/auth/login", {
        headers: { Origin: "https://unrelated.example" },
        data: { secret: "invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/auth/login", { data: { secret: "invalid" } })
    ).status(),
  ).toBe(401);
  const secret =
    process.env.APP_LOGIN_SECRET?.trim() ||
    (await readFile("app-login-secret", "utf8")).trim();
  expect(
    (await request.post("/api/auth/login", { data: { secret } })).status(),
  ).toBe(200);
  const state = await request.storageState();
  const cookie = state.cookies.find((item) => item.name === "caltrack_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.expires).toBeGreaterThan(
    Date.now() / 1_000 + 360 * 24 * 60 * 60,
  );
  expect((await request.get("/api/bootstrap")).status()).toBe(200);
  expect((await request.post("/api/auth/logout")).status()).toBe(200);
  expect((await request.get("/api/bootstrap")).status()).toBe(401);
});
