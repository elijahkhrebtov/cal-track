import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next can expose an internal localhost URL even when the browser used a
  // public or loopback hostname. Validate against the actual HTTP Host instead.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    new URL(request.url).protocol.replace(":", "");
  const expectedOrigin = `${protocol}://${host}`;
  if (
    (origin && origin !== expectedOrigin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HttpError(415, "Send an application/json request.");
  }
  const text = await request.text();
  if (text.length > 500_000)
    throw new HttpError(413, "This request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON request.");
  }
}

export function api(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      if (error instanceof ZodError) {
        const issue = error.issues[0];
        return json(
          { error: `${issue.path.join(".") || "Input"}: ${issue.message}` },
          400,
        );
      }
      // Never log database URLs, provider tokens, secrets, or request bodies.
      console.error(
        "API request failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return json(
        { error: "The request could not be completed. Please try again." },
        500,
      );
    }
  };
}
