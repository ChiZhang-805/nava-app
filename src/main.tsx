import React from "react";
import ReactDOM from "react-dom/client";
import { installTranslationResilience } from "translation-resilience";
import AppBootstrap from "./AppBootstrap";
import "./styles/global.css";
import "./styles/product-ui.css";
import "./styles/shared-overlays.css";
import "./styles/app-skins.css";
import "./styles/mobile-viewport.css";
import { installMobileViewport } from "./services/mobileViewport";

const disposeMobileViewport = installMobileViewport();
if (import.meta.hot) import.meta.hot.dispose(disposeMobileViewport);

try {
  installTranslationResilience();
} catch (error) {
  console.warn("Unable to install browser-translation resilience", error);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBootstrap />
  </React.StrictMode>,
);
