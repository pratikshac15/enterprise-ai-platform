
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import keycloak from "./auth/keycloak";
import "./index.css";

keycloak
  .init({
    onLoad: "check-sso",
    pkceMethod: "S256",
    checkLoginIframe: false,
  })
  .then(() => {
    ReactDOM.createRoot(
      document.getElementById("root")!
    ).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error) => {
    console.error("Keycloak initialization failed:", error);
    document.getElementById("root")!.textContent =
      "Authentication initialization failed. Check the browser console.";
  });
