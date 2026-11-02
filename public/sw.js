self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  let data = {
    title: "Výtahy Servis",
    body: "Máš nové upozornění.",
    url: "/dashboard",
    tag: undefined,
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const title = data.title || "Výtahy Servis";

  const options = {
    body: data.body || "Máš nové upozornění.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",

    // důležité pro Android / Chrome
    silent: false,
    vibrate: [300, 120, 300, 120, 500],
    requireInteraction: true,

    // Každá porucha dostává vlastní tag. Díky tomu se různé poruchy v liště
    // telefonu vzájemně nepřepisují, ale duplicitní zpráva stejné poruchy ano.
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),

    data: {
      url: data.url || "/dashboard",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const requestedUrl = event.notification.data?.url || "/dashboard";
  const targetUrl = new URL(requestedUrl, self.location.origin);

  // Push payload nesmí otevřít cizí web.
  if (targetUrl.origin !== self.location.origin) {
    targetUrl.href = new URL("/dashboard", self.location.origin).href;
  }

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("navigate" in client && "focus" in client) {
            return client
              .navigate(targetUrl.href)
              .then((navigatedClient) => navigatedClient?.focus());
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl.href);
        }
      })
  );
});
