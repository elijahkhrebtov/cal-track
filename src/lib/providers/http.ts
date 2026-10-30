import { ProviderError } from "./common";

type Provider = "USDA";
const unavailableUntil = new Map<Provider, number>();

export function deferProvider(provider: Provider, milliseconds: number): void {
  unavailableUntil.set(provider, Date.now() + milliseconds);
}

export async function fetchJson(
  provider: Provider,
  url: string | URL,
  options: RequestInit = {},
): Promise<unknown> {
  if ((unavailableUntil.get(provider) ?? 0) > Date.now()) {
    throw new ProviderError(
      provider,
      "temporarily unavailable; try again later.",
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ProviderError(provider, "request failed or timed out.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const retrySeconds = Number(retryAfter);
    const retryDate = retryAfter ? Date.parse(retryAfter) : NaN;
    const waitMs =
      Number.isFinite(retrySeconds) && retrySeconds > 0
        ? retrySeconds * 1000
        : Number.isFinite(retryDate) && retryDate > Date.now()
          ? retryDate - Date.now()
          : 60 * 60_000;
    deferProvider(provider, Math.max(30_000, waitMs));
    throw new ProviderError(provider, "rate limit reached; try again later.");
  }

  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "access denied; check the API key."
        : response.status === 404
          ? "food not found."
          : "service is unavailable.";
    throw new ProviderError(provider, message);
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderError(provider, "returned an invalid response.");
  }
}
