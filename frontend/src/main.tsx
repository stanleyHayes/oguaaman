import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { MotionConfig } from "motion/react";
import "./index.css";
import { router } from "./router";
import { AuthProvider } from "./lib/auth";
import { LanguageProvider } from "./lib/i18n";

// Offline shell (spec §11): register the service worker for production
// builds — dev keeps plain vite HMR with no interception.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is progressive enhancement — never break boot.
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <LanguageProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </LanguageProvider>
    </MotionConfig>
  </StrictMode>,
);
