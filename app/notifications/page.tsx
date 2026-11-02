"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ApiResult = {
  ok?: boolean;
  active?: boolean;
  error?: string;
  sent?: number;
  total?: number;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

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

function sameApplicationServerKey(
  subscription: PushSubscription,
  expectedKey: Uint8Array<ArrayBuffer>
) {
  const currentKey = subscription.options.applicationServerKey;
  if (!currentKey) return false;

  const currentBytes = new Uint8Array(currentKey);
  if (currentBytes.length !== expectedKey.length) return false;

  return currentBytes.every((value, index) => value === expectedKey[index]);
}

async function readApiResult(response: Response): Promise<ApiResult> {
  const responseText = await response.text();

  try {
    return responseText ? (JSON.parse(responseText) as ApiResult) : {};
  } catch {
    return {
      error:
        responseText ||
        `Server nevrátil JSON odpověď. HTTP status: ${response.status}`,
    };
  }
}

function isInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as NavigatorWithStandalone).standalone)
  );
}

export default function NotificationsPage() {
  const [permission, setPermission] = useState<
    NotificationPermission | "unknown"
  >("unknown");
  const [supported, setSupported] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null
  );
  const [serverActive, setServerActive] = useState(false);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const getSessionToken = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("Nejsi přihlášený nebo chybí session token.");
    }

    return session.access_token;
  }, []);

  const refreshDeviceState = useCallback(async () => {
    setChecking(true);

    try {
      const isSupported =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      setSupported(isSupported);
      setInstalled(typeof window !== "undefined" && isInstalledApp());

      if (!isSupported) {
        setPermission("unknown");
        setSubscription(null);
        setServerActive(false);
        return;
      }

      setPermission(Notification.permission);

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await registration.update().catch(() => undefined);

      const readyRegistration = await navigator.serviceWorker.ready;
      const currentSubscription =
        await readyRegistration.pushManager.getSubscription();

      setSubscription(currentSubscription);

      if (!currentSubscription) {
        setServerActive(false);
        return;
      }

      const token = await getSessionToken();
      const response = await fetch("/api/push/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint: currentSubscription.endpoint }),
      });
      const result = await readApiResult(response);

      if (!response.ok) {
        throw new Error(result.error || "Nepodařilo se ověřit stav zařízení.");
      }

      setServerActive(result.active === true);
    } catch (error) {
      setServerActive(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Nepodařilo se načíst stav upozornění."
      );
    } finally {
      setChecking(false);
    }
  }, [getSessionToken]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void refreshDeviceState();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [refreshDeviceState]);

  async function sendTestToDevice(currentSubscription: PushSubscription) {
    const token = await getSessionToken();
    const response = await fetch("/api/push/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: currentSubscription.endpoint }),
    });
    const result = await readApiResult(response);

    if (!response.ok) {
      throw new Error(result.error || "Nepodařilo se poslat test.");
    }

    return result;
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
        throw new Error("Na serveru chybí veřejný VAPID klíč.");
      }

      const requestedPermission = await Notification.requestPermission();
      setPermission(requestedPermission);

      if (requestedPermission !== "granted") {
        throw new Error(
          requestedPermission === "denied"
            ? "Upozornění jsou zakázaná v nastavení telefonu nebo prohlížeče."
            : "Upozornění nebyla povolena."
        );
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await registration.update().catch(() => undefined);

      const readyRegistration = await navigator.serviceWorker.ready;
      const expectedKey = urlBase64ToUint8Array(vapidPublicKey);
      let currentSubscription =
        await readyRegistration.pushManager.getSubscription();

      if (
        currentSubscription &&
        !sameApplicationServerKey(currentSubscription, expectedKey)
      ) {
        await currentSubscription.unsubscribe();
        currentSubscription = null;
      }

      currentSubscription ??= await readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey,
      });

      const token = await getSessionToken();
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(currentSubscription),
      });
      const result = await readApiResult(response);

      if (!response.ok) {
        throw new Error(result.error || "Nepodařilo se uložit zařízení.");
      }

      setSubscription(currentSubscription);
      setServerActive(true);
      setSuccessMessage("Upozornění jsou na tomto zařízení zapnutá.");

      try {
        const testResult = await sendTestToDevice(currentSubscription);
        setSuccessMessage(
          `Upozornění jsou zapnutá a test byl odeslán (${testResult.sent ?? 0}/${
            testResult.total ?? 0
          }).`
        );
      } catch (testError) {
        setMessage(
          `Zapnutí se uložilo, ale test se nepodařil: ${
            testError instanceof Error ? testError.message : "neznámá chyba"
          }`
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Neznámá chyba.");
    } finally {
      setLoading(false);
    }
  }

  async function disableNotifications() {
    setLoading(true);
    setMessage("");
    setSuccessMessage("");

    try {
      if (!subscription) {
        setServerActive(false);
        setSuccessMessage("Upozornění už jsou na tomto zařízení vypnutá.");
        return;
      }

      const token = await getSessionToken();
      const response = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const result = await readApiResult(response);

      if (!response.ok) {
        throw new Error(result.error || "Nepodařilo se vypnout upozornění.");
      }

      await subscription.unsubscribe().catch(() => false);
      setSubscription(null);
      setServerActive(false);
      setSuccessMessage("Upozornění jsou na tomto zařízení vypnutá.");
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
      if (!subscription || !serverActive) {
        throw new Error("Nejdřív zapni upozornění pro toto zařízení.");
      }

      const result = await sendTestToDevice(subscription);
      setSuccessMessage(
        `Testovací upozornění bylo odesláno (${result.sent ?? 0}/${
          result.total ?? 0
        }).`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Neznámá chyba.");
    } finally {
      setLoading(false);
    }
  }

  const enabled =
    permission === "granted" && Boolean(subscription) && serverActive;
  const statusLabel = checking
    ? "Kontroluju stav…"
    : !supported
      ? "Zařízení nepodporuje push"
      : permission === "denied"
        ? "Zakázáno v telefonu"
        : enabled
          ? "Zapnuto"
          : "Vypnuto";

  return (
    <main className="notifications-shell">
      <section className="notifications-card">
        <div className="kicker">Výtahy DC</div>
        <h1>Upozornění na mobil</h1>
        <p className="intro">
          Tady zapneš nebo vypneš oznámení pouze pro tento telefon. Po zapnutí
          ti aplikace pošle zkušební zprávu a následně upozornění na nové
          poruchy, které máš vidět.
        </p>

        <div className={`device-state ${enabled ? "enabled" : ""}`}>
          <div>
            <span className="state-icon" aria-hidden="true">
              {enabled ? "✓" : "!"}
            </span>
            <div>
              <strong>{statusLabel}</strong>
              <small>
                {installed
                  ? "Aplikace běží z ikony v telefonu"
                  : "Otevřeno v prohlížeči – po instalaci funguje stejně"}
              </small>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? "Vypnout upozornění" : "Zapnout upozornění"}
            className={`notification-switch ${enabled ? "on" : ""}`}
            disabled={
              checking ||
              loading ||
              !supported ||
              permission === "denied"
            }
            onClick={enabled ? disableNotifications : enableNotifications}
          >
            <span />
          </button>
        </div>

        <dl className="status-list">
          <div>
            <dt>Podpora telefonu</dt>
            <dd>{supported ? "Ano" : "Ne"}</dd>
          </div>
          <div>
            <dt>Povolení systému</dt>
            <dd>
              {permission === "granted"
                ? "Povoleno"
                : permission === "denied"
                  ? "Zakázáno"
                  : permission === "default"
                    ? "Zatím nerozhodnuto"
                    : "Kontroluju"}
            </dd>
          </div>
          <div>
            <dt>Toto zařízení</dt>
            <dd>{serverActive ? "Registrované" : "Neregistrované"}</dd>
          </div>
        </dl>

        {permission === "denied" && (
          <div className="warning-box">
            Upozornění byla v telefonu zakázaná. Otevři nastavení aplikace nebo
            prohlížeče, povol oznámení pro Výtahy DC a potom tuto stránku znovu
            načti.
          </div>
        )}

        {message && <div className="error-box">{message}</div>}
        {successMessage && (
          <div className="success-box">{successMessage}</div>
        )}

        <div className="actions">
          <button
            type="button"
            onClick={sendTestNotification}
            disabled={checking || loading || !enabled}
            className="test-button"
          >
            {loading ? "Pracuju…" : "Poslat testovací upozornění"}
          </button>
          <button
            type="button"
            onClick={() => void refreshDeviceState()}
            disabled={checking || loading}
            className="refresh-button"
          >
            Obnovit stav
          </button>
        </div>

        <div className="note">
          Na iPhonu fungují webové push notifikace až po přidání aplikace na
          plochu. Na Androidu je můžeš kdykoliv vypnout i v systémovém nastavení
          aplikace.
        </div>

        <Link href="/dashboard" className="back-link">
          Zpět na hlavní stránku
        </Link>
      </section>

      <style jsx>{`
        .notifications-shell {
          min-height: 100vh;
          margin-left: var(--sidebar-width);
          padding: 86px 28px 48px;
          background: #eef3f6;
          color: #10273a;
        }
        .notifications-card {
          width: min(720px, 100%);
          margin: 0 auto;
          padding: 28px;
          border: 1px solid #d3dfe6;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 18px 48px rgba(10, 38, 57, 0.1);
        }
        .kicker {
          color: #078043;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }
        h1 {
          margin: 7px 0 0;
          color: #062b49;
          font-size: clamp(30px, 5vw, 42px);
          letter-spacing: -0.035em;
        }
        .intro {
          margin: 12px 0 0;
          color: #52697b;
          line-height: 1.6;
        }
        .device-state {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-top: 24px;
          padding: 18px;
          border: 1px solid #d7e1e7;
          border-radius: 17px;
          background: #f7f9fa;
        }
        .device-state.enabled {
          border-color: #87d5aa;
          background: #e8f7ee;
        }
        .device-state > div {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }
        .device-state strong,
        .device-state small {
          display: block;
        }
        .device-state strong {
          color: #082a49;
          font-size: 18px;
        }
        .device-state small {
          margin-top: 3px;
          color: #617688;
        }
        .state-icon {
          width: 42px;
          height: 42px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: #e3eaee;
          color: #52697b;
          font-weight: 950;
        }
        .enabled .state-icon {
          background: #079447;
          color: #fff;
        }
        .notification-switch {
          width: 62px;
          height: 34px;
          flex: 0 0 auto;
          padding: 3px;
          border: 0;
          border-radius: 999px;
          background: #9aabb7;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .notification-switch span {
          display: block;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 2px 7px rgba(9, 31, 46, 0.28);
          transition: transform 0.2s ease;
        }
        .notification-switch.on {
          background: #079447;
        }
        .notification-switch.on span {
          transform: translateX(28px);
        }
        .notification-switch:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .status-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin: 16px 0 0;
        }
        .status-list div {
          padding: 13px;
          border: 1px solid #e0e7eb;
          border-radius: 13px;
        }
        .status-list dt {
          color: #718293;
          font-size: 12px;
          font-weight: 800;
        }
        .status-list dd {
          margin: 5px 0 0;
          color: #0c304d;
          font-weight: 900;
        }
        .error-box,
        .success-box,
        .warning-box,
        .note {
          margin-top: 14px;
          padding: 13px 14px;
          border-radius: 13px;
          line-height: 1.5;
        }
        .error-box {
          border: 1px solid #efb1b1;
          background: #fff0f0;
          color: #a42525;
        }
        .success-box {
          border: 1px solid #93d8b0;
          background: #e9f8ef;
          color: #086b38;
        }
        .warning-box {
          border: 1px solid #efc57f;
          background: #fff5e6;
          color: #815315;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }
        .actions button {
          min-height: 46px;
          padding: 11px 16px;
          border-radius: 11px;
          font-weight: 900;
          cursor: pointer;
        }
        .actions button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .test-button {
          border: 0;
          background: #087d42;
          color: #fff;
        }
        .refresh-button {
          border: 1px solid #bdcad2;
          background: #fff;
          color: #17374d;
        }
        .note {
          border: 1px dashed #bdcad2;
          background: #f8fafb;
          color: #5d7283;
        }
        .back-link {
          display: inline-block;
          margin-top: 18px;
          color: #087d42;
          font-weight: 900;
          text-decoration: none;
        }
        @media (max-width: 900px) {
          .notifications-shell {
            margin-left: 0;
            padding: 84px 14px 34px;
          }
        }
        @media (max-width: 560px) {
          .notifications-card {
            padding: 20px 16px;
            border-radius: 18px;
          }
          .device-state {
            padding: 15px;
          }
          .status-list {
            grid-template-columns: 1fr;
          }
          .actions button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
