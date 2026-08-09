import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SectionIcon } from "./section-icon";

interface MobileTab {
  to: string;
  label: string;
  icon: string;
  action?: boolean;
}

const TABS: readonly MobileTab[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/community", label: "Community", icon: "community" },
  { to: "/submit", label: "Contribute", icon: "submit", action: true },
  { to: "/events", label: "Events", icon: "events" },
  { to: "/me", label: "Profile", icon: "people" },
];

function isActive(pathname: string, target: string): boolean {
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(`${target}/`);
}

function TabIcon({ icon }: Readonly<{ icon: string }>) {
  if (icon !== "submit") return <SectionIcon id={icon} className="h-[1.3rem] w-[1.3rem]" />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[1.3rem] w-[1.3rem]" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const [docked, setDocked] = useState(false);

  useEffect(() => {
    const footer = document.querySelector(".site-footer");
    if (!footer || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setDocked(entry.isIntersecting),
      { threshold: 0.08 },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Quick navigation"
      data-docked={docked ? "true" : "false"}
      className={`fixed z-[70] lg:hidden ${docked ? "inset-x-0 bottom-0" : "inset-x-2.5 bottom-[max(.625rem,env(safe-area-inset-bottom))] drop-shadow-[0_.7rem_1.4rem_rgba(12,44,31,.22)]"}`}
    >
      <ul className={`grid grid-cols-5 overflow-hidden border border-sand/80 bg-paper/90 p-0 backdrop-blur-xl backdrop-saturate-150 transition-[border-radius,background-color] duration-300 ${docked ? "rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]" : "rounded-full"}`}>
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.to);
          return (
            <li key={tab.to} className="flex min-w-0">
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.6rem] font-semibold tracking-[0.06em] transition-[color,background-color,transform] duration-150 active:scale-[0.96] ${active ? "text-green" : "text-ink-faint hover:text-ink"} ${tab.action ? "isolate text-gold-text" : ""}`}
              >
                {active && <span className={`absolute left-1/2 top-[-1px] h-0.5 w-7 -translate-x-1/2 rounded-b ${tab.action ? "bg-gold-brand" : "bg-teal"}`} aria-hidden />}
                {tab.action && <span className={`absolute inset-x-1.5 inset-y-1 -z-10 rounded-full transition-colors ${active ? "bg-gold/25" : "bg-gold/[0.11]"}`} aria-hidden />}
                <span className={tab.action ? "text-gold-text" : active ? "text-teal-text" : ""}><TabIcon icon={tab.icon} /></span>
                <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
