"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export default function NotificationsPage() {
  const [permission, setPermission] = useState<NotificationPermission | "unknown">(
    "unknown"
  );
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    const isSupported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setSupported(isSupported);

    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  async function getSessionToken() {
    const supabase = createClient();

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("Nejsi přihlášený nebo chybí session token.");
    }

    return session.access_token;
  }

  async function enableNotifications() {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    try {
      if (!supported) {
        throw new Error("Tenhle prohlížeč nebo zařízení nepodporuje web push.");
      }

      if (!vapidPublicKey) {
        throw new Error(
          "Chybí NEXT_PUBLIC_VAPID_PUBLIC_KEY. Zkontroluj env proměnné."
        );
      }

      const requestedPermission = await Notification.requestPermission();
      setPermission(requestedPermission);

      if (requestedPermission !== "granted") {
        throw new Error("Upozornění nebyla povolena.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");

      await navigator.serviceWorker.ready;

      const existingSubscription =
        await registration.pushManager.getSubscription();

      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const token = await getSessionToken();

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(subscription),
      });

      const responseText = await response.text();

      let result: { ok?: boolean; error?: string } = {};

      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        result = {
          error:
            responseText ||
            `Server nevrátil JSON odpověď. HTTP status: ${response.status}`,
        };
      }

      if (!response.ok) {
        throw new Error(result.error || "Nepodařilo se uložit zařízení.");
      }

      setSuccessMessage("Upozornění jsou zapnutá pro tohle zařízení.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Neznámá chyba.");
    } finally {
      setLoading(false);
    }
  }

  async function sendTestNotification() {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    try {
      const token = await getSessionToken();

      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseText = await response.text();

      let result: { ok?: boolean; error?: string; sent?: number; total?: number } =
        {};

      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        result = {
          error:
            responseText ||
            `Server nevrátil JSON odpověď. HTTP status: ${response.status}`,
        };
      }

      if (!response.ok) {
        throw new Error(result.error || "Nepodařilo se poslat test.");
      }

      setSuccessMessage(
        `Testovací upozornění odesláno. Odesláno: ${result.sent ?? 0}/${
          result.total ?? 0
        }.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Neznámá chyba.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>Výtahy Servis</div>
        <h1 style={styles.title}>Upozornění na mobil</h1>
        <p style={styles.text}>
          Nejdřív zapni upozornění pro tohle zařízení. Potom pošli testovací
          notifikaci. Až to bude fungovat, napojíme to na nově vytvořené
          poruchy.
        </p>

        <div style={styles.statusBox}>
          <div>
            <strong>Podpora zařízení:</strong>{" "}
            {supported ? "Podporováno" : "Nepodporováno"}
          </div>
          <div>
            <strong>Stav oprávnění:</strong> {permission}
          </div>
        </div>

        {message && <div style={styles.errorBox}>{message}</div>}
        {successMessage && <div style={styles.successBox}>{successMessage}</div>}

        <div style={styles.actions}>
          <button
            type="button"
            onClick={enableNotifications}
            disabled={loading}
            style={styles.primaryButton}
          >
            {loading ? "Pracuju..." : "Zapnout upozornění"}
          </button>

          <button
            type="button"
            onClick={sendTestNotification}
            disabled={loading}
            style={styles.secondaryButton}
          >
            Poslat testovací upozornění
          </button>
        </div>

        <div style={styles.note}>
          Na iPhonu může být potřeba otevřít aplikaci z ikony na ploše a povolit
          notifikace až tam.
        </div>

        <Link href="/dashboard" style={styles.link}>
          Zpět na hlavní stránku
        </Link>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#020617",
    color: "#f8fafc",
    display: "grid",
    placeItems: "center",
    padding: 24,
  },

  card: {
    width: "100%",
    maxWidth: 620,
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 24,
    padding: 26,
    boxShadow: "0 25px 80px rgba(0,0,0,0.35)",
  },

  kicker: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
  },

  title: {
    margin: 0,
    fontSize: 34,
    fontWeight: 950,
    letterSpacing: "-0.03em",
  },

  text: {
    color: "#cbd5e1",
    lineHeight: 1.6,
    marginTop: 12,
  },

  statusBox: {
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gap: 8,
    marginTop: 18,
    color: "#cbd5e1",
  },

  errorBox: {
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    color: "#fecaca",
    padding: 13,
    borderRadius: 14,
    marginTop: 14,
  },

  successBox: {
    background: "#052e16",
    border: "1px solid #166534",
    color: "#bbf7d0",
    padding: 13,
    borderRadius: 14,
    marginTop: 14,
  },

  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
  },

  primaryButton: {
    background: "#2563eb",
    color: "white",
    border: 0,
    borderRadius: 13,
    padding: "13px 18px",
    fontWeight: 950,
    cursor: "pointer",
  },

  secondaryButton: {
    background: "#1e293b",
    color: "#f8fafc",
    border: "1px solid #334155",
    borderRadius: 13,
    padding: "13px 18px",
    fontWeight: 950,
    cursor: "pointer",
  },

  note: {
    color: "#94a3b8",
    background: "#020617",
    border: "1px dashed #334155",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
    lineHeight: 1.5,
  },

  link: {
    color: "#93c5fd",
    display: "inline-block",
    marginTop: 18,
    fontWeight: 900,
    textDecoration: "none",
  },
};