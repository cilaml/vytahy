"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as NavigatorWithStandalone).standalone)
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function PwaInstaller() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const initializationFrame = window.requestAnimationFrame(() => {
      setInstalled(isStandalone());
      setIsIos(isIosDevice());
      setDismissed(sessionStorage.getItem("pwa-install-dismissed") === "1");
    });

    const registerServiceWorker = () => {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.cancelAnimationFrame(initializationFrame);
      window.removeEventListener("load", registerServiceWorker);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;

      if (choice.outcome === "accepted") {
        setInstalled(true);
      }

      setInstallPrompt(null);
      return;
    }

    if (isIos) {
      setShowIosHelp((current) => !current);
    }
  }

  function dismiss() {
    sessionStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  }

  if (installed || dismissed || (!installPrompt && !isIos)) {
    return null;
  }

  return (
    <aside
      aria-label="Instalace aplikace"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1000,
        width: "min(360px, calc(100vw - 32px))",
        border: "1px solid #334155",
        borderRadius: 18,
        background: "#0f172a",
        color: "#f8fafc",
        boxShadow: "0 20px 45px rgba(2, 6, 23, 0.45)",
        padding: 16,
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Zavřít nabídku instalace"
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          border: 0,
          background: "transparent",
          color: "#94a3b8",
          cursor: "pointer",
          fontSize: 22,
          lineHeight: 1,
        }}
      >
        ×
      </button>

      <div style={{ paddingRight: 22 }}>
        <strong style={{ display: "block", fontSize: 16 }}>
          Nainstalovat Výtahy DC
        </strong>
        <span style={{ color: "#cbd5e1", fontSize: 13 }}>
          Vlastní ikona a samostatné okno jako u běžného programu.
        </span>
      </div>

      {showIosHelp ? (
        <p
          style={{
            margin: "14px 0 0",
            borderRadius: 12,
            background: "#020617",
            padding: 12,
            color: "#e2e8f0",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          V Safari klepni na <strong>Sdílet</strong> a potom na{" "}
          <strong>Přidat na plochu</strong>.
        </p>
      ) : null}

      <button
        type="button"
        onClick={installApp}
        style={{
          width: "100%",
          marginTop: 14,
          border: 0,
          borderRadius: 12,
          background: "#16a34a",
          color: "white",
          cursor: "pointer",
          fontWeight: 700,
          padding: "11px 14px",
        }}
      >
        {isIos && !installPrompt ? "Jak přidat na plochu" : "Nainstalovat"}
      </button>
    </aside>
  );
}
