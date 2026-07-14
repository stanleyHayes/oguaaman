import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { MotionConfig } from "motion/react";
import "./index.css";
import { router } from "./router";
import { AuthProvider } from "./lib/auth";
import { AuthGate } from "./components/auth-gate";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </AuthProvider>
    </MotionConfig>
  </StrictMode>,
);
