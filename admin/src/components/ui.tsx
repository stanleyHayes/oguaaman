import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { ListingStatus } from "@/lib/types";

export function BackLink({ to, children }: Readonly<{ to: string; children: ReactNode }>) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-gold-text">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
      {children}
    </Link>
  );
}

/** A labelled key/value row for detail pages. */
export function KeyVal({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-sand py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export function Card({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={`rounded-[var(--radius-card)] border border-sand bg-cream ${className}`}>{children}</div>;
}

const STATUS_STYLE: Record<ListingStatus, string> = {
  approved: "bg-green/[0.1] text-green-text",
  pending: "bg-gold/[0.18] text-gold-text",
  rejected: "bg-maroon-900/[0.1] text-maroon-text",
  draft: "bg-sand text-ink-muted",
  unpublished: "bg-sand text-ink-muted",
};
export function StatusBadge({ status }: Readonly<{ status: ListingStatus }>) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[status]}`}>{status}</span>;
}

export function RoleBadge({ role }: Readonly<{ role: string }>) {
  const m: Record<string, string> = {
    steward: "bg-maroon-900/[0.1] text-maroon-text",
    curator: "bg-ai/[0.1] text-ai",
    editor: "bg-teal/[0.12] text-teal-text",
    accountability: "bg-gold/[0.15] text-gold-text",
    vetting: "bg-ai/[0.1] text-ai",
    member: "bg-sand text-ink-muted",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${m[role] ?? m.member}`}>{role}</span>;
}

export function Pill({ children, tone = "neutral" }: Readonly<{ children: ReactNode; tone?: "neutral" | "green" | "gold" | "clay" }>) {
  const m: Record<string, string> = {
    neutral: "border-sand bg-paper text-ink-muted",
    green: "border-green/30 bg-green/[0.06] text-green-text",
    gold: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
    clay: "border-clay/30 bg-clay/[0.08] text-clay-text",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${m[tone]}`}>{children}</span>;
}

export function PageHeader({ kicker, title, children }: Readonly<{ kicker: string; title: string; children?: ReactNode }>) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow text-ai">{kicker}</p>
        <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
      </div>
      {children}
    </div>
  );
}

interface SelectOption {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  group?: string;
}

interface SelectOptionRun {
  group?: string;
  entries: { option: SelectOption; index: number }[];
}

interface OptionElementProps {
  children?: ReactNode;
  value?: string | number;
  disabled?: boolean;
  label?: string;
}

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement<OptionElementProps>(node)) return plainText(node.props.children);
  return "";
}

/** Read familiar option/optgroup children without ever mounting a native select. */
function readSelectOptions(children: ReactNode, group?: string): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionElementProps>(child)) return;
    const element = child as ReactElement<OptionElementProps>;
    if (element.type === "option") {
      const label = element.props.children ?? element.props.label ?? element.props.value ?? "";
      options.push({
        value: String(element.props.value ?? plainText(label)),
        label,
        text: plainText(label),
        disabled: Boolean(element.props.disabled),
        group,
      });
      return;
    }
    if (element.type === "optgroup") {
      options.push(...readSelectOptions(element.props.children, element.props.label));
    }
  });
  return options;
}

function enabledIndex(options: SelectOption[], from: number, step: 1 | -1): number {
  if (options.length === 0) return -1;
  for (let distance = 1; distance <= options.length; distance++) {
    const index = (from + distance * step + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

function groupOptionRuns(options: SelectOption[]): SelectOptionRun[] {
  return options.reduce<SelectOptionRun[]>((runs, option, index) => {
    const previous = runs.at(-1);
    if (previous && previous.group === option.group) {
      return [...runs.slice(0, -1), { ...previous, entries: [...previous.entries, { option, index }] }];
    }
    return [...runs, { group: option.group, entries: [{ option, index }] }];
  }, []);
}

const FOCUSABLE_SELECTOR = [
  "a[href]:not([tabindex='-1'])",
  "button:not([disabled]):not([tabindex='-1'])",
  "input:not([disabled]):not([type='hidden']):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Continue the trigger's document-order tab sequence after a portalled menu closes. */
function focusNextTo(trigger: HTMLElement, backwards: boolean): void {
  const focusable = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));
  const current = focusable.indexOf(trigger);
  if (current < 0 || focusable.length < 2) {
    trigger.focus();
    return;
  }
  const offset = backwards ? -1 : 1;
  focusable[(current + offset + focusable.length) % focusable.length]?.focus();
}

interface SelectProps {
  children: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  icon?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  size?: "default" | "compact";
  triggerClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
}

/**
 * Branded, non-native single-select. The trigger and portalled listbox support
 * arrows, Home/End, Enter/Space, Escape, typeahead, click-away dismissal, and
 * active-descendant focus without being clipped by tables or cards.
 */
export function Select({
  children,
  value,
  onValueChange,
  className = "",
  icon,
  disabled = false,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  size = "default",
  triggerClassName = "",
  menuClassName = "",
  optionClassName = "",
}: Readonly<SelectProps>) {
  const generatedId = useId();
  const controlId = id ?? `select-${generatedId.replaceAll(":", "")}`;
  const listboxId = `${controlId}-listbox`;
  const options = readSelectOptions(children);
  const optionRuns = groupOptionRuns(options);
  const selectedIndex = options.findIndex((option) => option.value === String(value));
  const selected = options[selectedIndex];
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const [position, setPosition] = useState<CSSProperties>({});

  const measureMenu = useCallback((): CSSProperties => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const gutter = 8;
    const width = Math.max(rect.width, size === "compact" ? 144 : 176);
    const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter));
    const below = window.innerHeight - rect.bottom - gutter;
    const above = rect.top - gutter;
    const opensAbove = below < 176 && above > below;
    const maxHeight = Math.max(128, Math.min(280, opensAbove ? above - 6 : below - 6));
    return opensAbove
      ? { position: "fixed", bottom: window.innerHeight - rect.top + 6, left, width, maxHeight }
      : { position: "fixed", top: rect.bottom + 6, left, width, maxHeight };
  }, [size]);

  const openMenu = (preferredIndex = selectedIndex) => {
    if (disabled || options.length === 0) return;
    const fallback = options.findIndex((option) => !option.disabled);
    const next = preferredIndex >= 0 && !options[preferredIndex]?.disabled ? preferredIndex : fallback;
    setActiveIndex(next);
    setPosition(measureMenu());
    setOpen(true);
    requestAnimationFrame(() => listRef.current?.focus());
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!open) return;
    const reposition = () => setPosition(measureMenu());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) closeMenu();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [measureMenu, open]);

  const moveActive = (step: 1 | -1) => {
    const next = enabledIndex(options, activeIndex, step);
    if (next >= 0) {
      setActiveIndex(next);
      requestAnimationFrame(() => document.getElementById(`${listboxId}-option-${next}`)?.scrollIntoView({ block: "nearest" }));
    }
  };

  const runTypeahead = (key: string, eventTime: number) => {
    const previous = eventTime - typeaheadRef.current.at > 650 ? "" : typeaheadRef.current.text;
    const text = `${previous}${key}`.toLocaleLowerCase();
    typeaheadRef.current = { text, at: eventTime };
    const match = options.findIndex((option) => !option.disabled && option.text.toLocaleLowerCase().startsWith(text));
    if (match >= 0) setActiveIndex(match);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const index = event.key === "End"
        ? options.findLastIndex((option) => !option.disabled)
        : event.key === "Home"
          ? options.findIndex((option) => !option.disabled)
          : enabledIndex(options, selectedIndex < 0 ? (event.key === "ArrowDown" ? -1 : 0) : selectedIndex, event.key === "ArrowDown" ? 1 : -1);
      openMenu(index);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const index = event.key === "Home"
        ? options.findIndex((option) => !option.disabled)
        : options.findLastIndex((option) => !option.disabled);
      if (index >= 0) setActiveIndex(index);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const trigger = triggerRef.current;
      closeMenu();
      if (trigger) requestAnimationFrame(() => focusNextTo(trigger, event.shiftKey));
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      runTypeahead(event.key, event.timeStamp);
    }
  };

  const renderOption = (option: SelectOption, index: number) => {
    const active = index === activeIndex;
    const checked = option.value === String(value);
    const spacing = size === "compact" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2.5 text-sm";
    return (
      <button
        type="button"
        id={`${listboxId}-option-${index}`}
        role="option"
        tabIndex={-1}
        aria-selected={checked}
        aria-disabled={option.disabled || undefined}
        disabled={option.disabled}
        onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
        onClick={() => commit(index)}
        className={`flex w-full cursor-default items-center gap-3 rounded-xl text-left transition-colors ${spacing} ${
          option.disabled
            ? "opacity-45"
            : active
              ? "bg-green text-on-green"
              : "text-ink hover:bg-paper"
        } ${optionClassName}`}
      >
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {checked && (
          <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 ${active ? "text-gold" : "text-teal-text"}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m4 10 4 4 8-8" />
          </svg>
        )}
      </button>
    );
  };

  const listbox = open ? (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      tabIndex={-1}
      aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : "Choose an option")}
      aria-labelledby={ariaLabelledBy}
      aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      onKeyDown={handleListKeyDown}
      className={`z-[80] overflow-y-auto rounded-2xl border border-sand bg-cream p-1.5 shadow-[0_22px_60px_-18px_rgba(12,44,31,0.38)] focus:outline-none ${menuClassName}`}
      style={position}
    >
      {optionRuns.map((run, runIndex) => {
        if (!run.group) {
          return run.entries.map(({ option, index }) => (
            <li key={`option-${option.value}-${index}`} role="presentation">{renderOption(option, index)}</li>
          ));
        }
        const groupId = `${listboxId}-group-${runIndex}`;
        return (
          <li key={`${run.group}-${runIndex}`} role="group" aria-labelledby={groupId}>
            <div id={groupId} className="px-3 pb-1 pt-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">{run.group}</div>
            <ul role="presentation">
              {run.entries.map(({ option, index }) => (
                <li key={`${run.group}-${option.value}-${index}`} role="presentation">{renderOption(option, index)}</li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div className={`relative inline-flex min-w-0 ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full min-w-0 items-center gap-2.5 border border-sand bg-cream text-left text-ink shadow-sm transition-[border-color,box-shadow,background-color] hover:border-gold-border/60 focus:border-ai focus:outline-none focus:ring-2 focus:ring-ai/20 disabled:cursor-not-allowed disabled:opacity-50 ${
          size === "compact" ? "min-h-8 rounded-lg py-1 pl-2.5 pr-1.5 text-xs" : "min-h-10 rounded-xl py-2 pl-3 pr-2 text-sm"
        } ${triggerClassName}`}
      >
        {icon ? <span className="shrink-0 text-ink-faint">{icon}</span> : null}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? "Select…"}</span>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-paper text-ink-faint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {listbox ? createPortal(listbox, document.body) : null}
    </div>
  );
}

/** Icon names for the shared Empty state — inline stroke SVGs (Lucide-style paths). */
export type EmptyIconName =
  | "sparkle" | "check" | "pen" | "ticket" | "bell" | "chart" | "building"
  | "shield" | "search" | "heart" | "money" | "image" | "inbox" | "calendar"
  | "users" | "megaphone";

const EMPTY_ICONS: Record<EmptyIconName, ReactNode> = {
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  pen: (
    <>
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </>
  ),
  ticket: (
    <>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 11v2" />
      <path d="M13 17v2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  building: (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </>
  ),
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  money: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
};

type EmptyTone = "gold" | "green" | "ai";
const EMPTY_TONES: Record<EmptyTone, string> = {
  gold: "border-gold-border/30 bg-gold/[0.12] text-gold-text",
  green: "border-green/25 bg-green/[0.08] text-green-text",
  ai: "border-ai/25 bg-ai-tint text-ai",
};

export function EmptyGlyph({ name, size = 26 }: Readonly<{ name: EmptyIconName; size?: number }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {EMPTY_ICONS[name]}
    </svg>
  );
}

/**
 * Shared empty state — a gently floating icon inside a pulsing ring, a title,
 * a description, and optional action buttons. `compact` renders a slim
 * left-aligned row for nested contexts (inside cards, lists, editors).
 */
export function Empty({ title = "Nothing here yet", icon = "sparkle", tone, compact = false, children, actions }: Readonly<{ title?: string; icon?: EmptyIconName; tone?: EmptyTone; compact?: boolean; children?: ReactNode; actions?: ReactNode }>) {
  const t: EmptyTone = tone ?? (icon === "check" ? "green" : "gold");
  if (compact) {
    return (
      <div className="flex items-center gap-3.5 px-5 py-6">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${EMPTY_TONES[t]}`}>
          <EmptyGlyph name={icon} size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {children && <p className="mt-0.5 text-sm text-ink-muted">{children}</p>}
        </div>
      </div>
    );
  }
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-empty-ring rounded-full border-2 border-gold-border/50" aria-hidden />
        <span className={`relative flex h-16 w-16 animate-empty-float items-center justify-center rounded-full border ${EMPTY_TONES[t]}`}>
          <EmptyGlyph name={icon} />
        </span>
      </div>
      <h3 className="mt-5 text-xl font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{children}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </Card>
  );
}
