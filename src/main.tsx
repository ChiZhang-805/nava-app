import React from "react";
import ReactDOM from "react-dom/client";
import { installTranslationResilience } from "translation-resilience";
import AppBootstrap from "./AppBootstrap";
import "./styles/global.css";
import "./styles/figma-v2.css";
import "./styles/shared-overlays.css";

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
