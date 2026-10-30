import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { accounts, loginAttempts, sessions } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";
import { verifySecret } from "@/lib/password";

export const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const COOKIE_NAME = "caltrack_session";
const SESSION_SECONDS = 365 * 24 * 60 * 60;
const RENEW_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function setCookie(token: string) {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function requireAccount(): Promise<string> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "Sign in to continue.");
  const [session] = await getDb()
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, digest(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session)
    throw new HttpError(401, "Your session expired. Sign in again.");
  if (Date.now() - session.renewedAt.getTime() > RENEW_AFTER_MS) {
    await getDb()
      .update(sessions)
      .set({
        renewedAt: new Date(),
        expiresAt: new Date(Date.now() + SESSION_SECONDS * 1_000),
      })
      .where(eq(sessions.tokenHash, session.tokenHash));
    await setCookie(token);
  }
  return session.accountId;
}

export async function login(secret: string, request: Request) {
  const address =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const key = digest(`caltrack-login:${address}`);
  const resetBefore = new Date(Date.now() - 15 * 60 * 1_000);
  const [attempt] = await getDb()
    .insert(loginAttempts)
    .values({ key })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        attempts: sql`case when ${loginAttempts.windowStart} < ${resetBefore} then 1 else ${loginAttempts.attempts} + 1 end`,
        windowStart: sql`case when ${loginAttempts.windowStart} < ${resetBefore} then now() else ${loginAttempts.windowStart} end`,
      },
    })
    .returning();
  if (attempt.attempts > 10)
    throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.id, ACCOUNT_ID))
    .limit(1);
  if (!account)
    throw new HttpError(
      503,
      "The account has not been initialized. Run db:seed.",
    );
  if (!(await verifySecret(secret, account.secretHash)))
    throw new HttpError(401, "Invalid secret.");
  await getDb().delete(loginAttempts).where(eq(loginAttempts.key, key));
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
  const token = randomBytes(32).toString("hex");
  await getDb()
    .insert(sessions)
    .values({
      tokenHash: digest(token),
      accountId: account.id,
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1_000),
    });
  await setCookie(token);
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token)
    await getDb()
      .delete(sessions)
      .where(eq(sessions.tokenHash, digest(token)));
  jar.delete(COOKIE_NAME);
}
