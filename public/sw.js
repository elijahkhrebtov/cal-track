// Installation only: private account and meal responses are never cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Intake</title><body style="background:#101010;color:#eeeeee;font:16px system-ui;padding:32px"><h1 style="font-size:24px">You’re offline</h1><p>Connect to the internet to open Intake.</p><button onclick="location.reload()" style="font:inherit;padding:12px 20px">Retry</button></body></html>',
            {
              status: 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
              },
            },
          ),
      ),
    );
  }
});
