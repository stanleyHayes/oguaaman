import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "./index.css";
import { AuthProvider } from "./lib/auth";
import { AuthGate } from "./components/auth-gate";
import { AdminRouter } from "./components/admin-router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <AuthGate>
          <AdminRouter />
        </AuthGate>
      </AuthProvider>
    </MotionConfig>
  </StrictMode>,
);
