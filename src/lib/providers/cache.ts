interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// A bounded warm-instance cache avoids repeated keystroke requests. The database
// supplies durable caching of foods the user has actually logged.
const values = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 256;

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const entry = values.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value as T;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const request = load().then((value) => {
    values.delete(key);
    while (values.size >= MAX_ENTRIES) {
      const oldest = values.keys().next().value;
      if (oldest !== undefined) values.delete(oldest);
    }
    values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  });

  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}
