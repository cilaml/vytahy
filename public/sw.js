self.addEventListener("push", function (event) {
  let data = {
    title: "Výtahy Servis",
    body: "Máš nové upozornění.",
    url: "/dashboard",
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
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url || "/dashboard",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});