import { describe, expect, it } from "vitest";
import { assertSameOrigin, HttpError, readJson } from "../src/lib/http";

describe("mutation request validation", () => {
  it("accepts a browser origin using the public Host behind Next's internal URL", () => {
    const request = new Request("http://localhost:3100/api/measurements", {
      headers: {
        host: "127.0.0.1:3100",
        origin: "http://127.0.0.1:3100",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("accepts HTTPS forwarded by Vercel", () => {
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost/api/meals", {
          headers: {
            host: "intake.example.com",
            origin: "https://intake.example.com",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects foreign origins and cross-site requests", () => {
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost/api/meals", {
          headers: {
            host: "intake.example.com",
            origin: "https://other.example.com",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toThrow(HttpError);
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost/api/meals", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toThrow(HttpError);
  });

  it("requires valid JSON content and rejects form content types", async () => {
    await expect(
      readJson(
        new Request("http://localhost/api/meals", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "name=Meal",
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(
        new Request("http://localhost/api/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{bad",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
