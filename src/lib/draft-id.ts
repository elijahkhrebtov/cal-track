// getRandomValues also works on HTTP LAN origins, where randomUUID is unavailable.
// Saved meal-entry IDs are assigned separately by the server.
export function draftId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
