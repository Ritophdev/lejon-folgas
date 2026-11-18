"use client";

import { useEffect, useState } from "react";
import { Check, Share, Smartphone, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPlatform = "ios" | "android" | "other";

export default function InstallAppCard() {
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  const [installedMessage, setInstalledMessage] = useState("");

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAppleMobile = /iphone|ipad|ipod/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(isAppleMobile ? "ios" : /android/.test(userAgent) ? "android" : "other");

    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsInstalled(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
      setInstalledMessage("Lejon Folgas foi adicionado à tela inicial.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    setReady(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (!ready || isInstalled) return null;

  async function installApp() {
    if (!installPrompt) {
      setShowInstructions((current) => !current);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      setInstalledMessage("Pronto! Lejon Folgas ficará disponível na tela inicial do seu celular.");
    } else {
      setShowInstructions(true);
    }
  }

  const buttonLabel = platform === "ios"
    ? "Como adicionar à tela inicial"
    : installPrompt
      ? "Instalar Lejon Folgas"
      : "Adicionar à tela inicial";

  return (
    <section className="install-app-card" aria-label="Instalar Lejon Folgas no celular">
      <div className="install-app-copy">
        <span className="install-app-icon"><Smartphone size={19} aria-hidden="true" /></span>
        <div>
          <strong>Tenha o Lejon Folgas na tela inicial</strong>
          <p>Abra o portal com um toque, como um aplicativo.</p>
        </div>
      </div>
      <button type="button" className="install-app-button" onClick={() => void installApp()}>
        <Smartphone size={17} aria-hidden="true" /> {buttonLabel}
      </button>
      {installedMessage && <p className="install-app-message" role="status"><Check size={15} /> {installedMessage}</p>}
      {showInstructions && (
        <div className="install-app-instructions" role="status" aria-live="polite">
          <button type="button" className="install-app-close" onClick={() => setShowInstructions(false)} aria-label="Fechar instruções"><X size={16} /></button>
          {platform === "ios" ? (
            <>
              <strong>Adicionar no iPhone ou iPad</strong>
              <ol>
                <li>Abra esta página no Safari e toque em <Share size={14} aria-label="Compartilhar" /> <b>Compartilhar</b>.</li>
                <li>Role as opções e escolha <b>Adicionar à Tela de Início</b>.</li>
                <li>Toque em <b>Adicionar</b> para concluir.</li>
              </ol>
            </>
          ) : platform === "android" ? (
            <>
              <strong>Adicionar no Android</strong>
              <ol>
                <li>No Chrome, toque no menu <b>⋮</b> no canto superior.</li>
                <li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
                <li>Confirme em <b>Instalar</b> ou <b>Adicionar</b>.</li>
              </ol>
            </>
          ) : (
            <>
              <strong>Adicionar à tela inicial</strong>
              <p>No menu do navegador, escolha <b>Instalar Lejon Folgas</b> ou <b>Adicionar à tela inicial</b>.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
