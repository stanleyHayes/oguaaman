import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LEGAL } from "@/lib/legal";
import { OPEN_SETTINGS_EVENT, STORAGE_KEYS, readStorageConsent, saveStorageConsent } from "@/lib/storage-consent";

/**
 * Storage & cookies notice (G124). Lists every key the portal keeps in the
 * browser, why and for how long. Essential keys are always used; optional ones
 * (affiliate attribution) only after "Accept optional". Reopened from the
 * footer's "Storage & cookies" link.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(() => readStorageConsent() == null);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    const open = () => { setVisible(true); setDetails(true); };
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);

  if (!visible) return null;

  function choose(optional: boolean) {
    saveStorageConsent(optional);
    setVisible(false);
    setDetails(false);
  }

  const btn = "shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2";
  return (
    <div
      role="dialog"
      aria-label="Storage and cookies"
      className="fixed inset-x-0 bottom-0 z-[80] max-h-[80vh] overflow-y-auto border-t border-sand bg-cream px-4 py-4 shadow-lg sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          Oguaa keeps a few things in your browser to sign you in and remember your settings. With your permission it also remembers
          which partner&rsquo;s link brought you to a shop, for 30 days.{" "}
          <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className="font-medium text-green underline underline-offset-2 hover:text-green/80">
            {details ? "Hide details" : "What we store"}
          </button>
          {" · "}
          <Link to={LEGAL.privacy} className="font-medium text-green underline underline-offset-2 hover:text-green/80">Privacy Policy</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => choose(false)} className={`${btn} border border-green/40 text-green hover:border-green`}>Essential only</button>
          <button type="button" onClick={() => choose(true)} className={`${btn} bg-green text-on-green hover:bg-green/90`}>Accept optional</button>
        </div>
      </div>
      {details && (
        <div className="mx-auto mt-4 max-w-5xl overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs text-ink-muted">
            <thead className="text-ink">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Key</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Why</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">How long</th>
                <th scope="col" className="py-1.5 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {STORAGE_KEYS.map((k) => (
                <tr key={k.key}>
                  <td className="py-1.5 pr-3 font-mono">{k.key}</td>
                  <td className="py-1.5 pr-3">{k.purpose}</td>
                  <td className="py-1.5 pr-3">{k.duration}</td>
                  <td className="py-1.5">{k.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-faint">Oguaa sets no advertising or analytics cookies. Fonts load from Google Fonts, and the Paystack payment window (when you pay) follows Paystack&rsquo;s own privacy policy.</p>
        </div>
      )}
    </div>
  );
}
