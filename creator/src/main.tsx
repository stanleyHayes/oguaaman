import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "./index.css";
import { RouterRoot } from "./router";
import { AuthProvider } from "./lib/auth";
import { AuthGate } from "./components/auth-gate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <AuthGate>
          <RouterRoot />
        </AuthGate>
      </AuthProvider>
    </MotionConfig>
  </StrictMode>,
);
