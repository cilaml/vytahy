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

type InstallNotice = {
  title: string;
  text: string;
} | null;

const INSTALL_APP_EVENT = "vd:install-app";

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
  const [notice, setNotice] = useState<InstallNotice>(null);

  useEffect(() => {
    let installPrompt: BeforeInstallPromptEvent | null = null;
    let installed = isStandalone();
    const isIos = isIosDevice();

    const registerServiceWorker = () => {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      }
    };

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPrompt = event as BeforeInstallPromptEvent;
    };

    const handleInstalled = () => {
      installed = true;
      installPrompt = null;
      setNotice({
        title: "Aplikace je nainstalovaná",
        text: "Výtahy DC teď najdeš mezi aplikacemi a můžeš je připnout na plochu nebo hlavní panel.",
      });
    };

    const handleInstallRequest = async () => {
      if (installed) {
        setNotice({
          title: "Aplikace už je nainstalovaná",
          text: "Výtahy DC už běží jako samostatná aplikace v tomto zařízení.",
        });
        return;
      }

      if (installPrompt) {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") {
          installed = true;
        }
        installPrompt = null;
        return;
      }

      if (isIos) {
        setNotice({
          title: "Přidat Výtahy DC na plochu",
          text: "V Safari klepni na Sdílet a potom na Přidat na plochu.",
        });
        return;
      }

      setNotice({
        title: "Instalace aplikace",
        text: "V nabídce prohlížeče zvol Nainstalovat aplikaci. Pokud tam volba není, aplikace už může být nainstalovaná nebo ji tento prohlížeč nepodporuje.",
      });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener(INSTALL_APP_EVENT, handleInstallRequest);

    return () => {
      window.removeEventListener("load", registerServiceWorker);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener(INSTALL_APP_EVENT, handleInstallRequest);
    };
  }, []);

  if (!notice) return null;

  return (
    <aside className="pwa-install-notice" aria-live="polite">
      <button type="button" onClick={() => setNotice(null)} aria-label="Zavřít informaci o instalaci">×</button>
      <strong>{notice.title}</strong>
      <p>{notice.text}</p>
    </aside>
  );
}
