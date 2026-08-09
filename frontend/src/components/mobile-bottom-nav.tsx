import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SectionIcon } from "./section-icon";
import styles from "./mobile-bottom-nav.module.css";

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
  if (icon !== "submit") return <SectionIcon id={icon} className={styles.icon} />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.icon} aria-hidden>
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
      className={styles.bar}
    >
      <ul className={styles.list}>
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.to);
          return (
            <li key={tab.to} className={tab.action ? styles.actionItem : styles.item}>
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
                className={tab.action ? styles.action : styles.link}
              >
                <TabIcon icon={tab.icon} />
                <span className={styles.label}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
