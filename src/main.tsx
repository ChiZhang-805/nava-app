import React from "react";
import ReactDOM from "react-dom/client";
import AppBootstrap from "./AppBootstrap";
import "./styles/global.css";
import "./styles/figma-v2.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBootstrap />
  </React.StrictMode>,
);
