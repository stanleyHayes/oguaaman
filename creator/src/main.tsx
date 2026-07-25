import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "./index.css";
import { installChunkReload } from "./lib/chunk-reload";
import { RouterRoot } from "./router";

installChunkReload();
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
