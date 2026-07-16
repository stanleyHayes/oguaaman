import { useState } from "react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "oguaa_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));

  if (!visible) return null;

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 border-t border-sand bg-cream px-4 py-4 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p className="text-sm text-ink-muted">
        We use essential cookies to keep you signed in and remember preferences.{" "}
        <Link to="/privacy" className="font-medium text-green underline underline-offset-2 hover:text-green/80">
          Privacy policy
        </Link>
      </p>
      <button
        type="button"
        onClick={accept}
        className="shrink-0 rounded-lg bg-green px-5 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
      >
        Got it
      </button>
    </div>
  );
}
