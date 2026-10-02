#!/usr/bin/env node
// sync-legal — generates each app's legal module from the canonical texts in
// docs/legal/*.md (decision D7: one versioned source, rendered identically in
// the portal, the mobile app and the marketing site).
//
//   node scripts/sync-legal.mjs          write the generated modules
//   node scripts/sync-legal.mjs --check  exit 1 when a generated module is stale
//
// Node built-ins only, and deterministic: the same sources always produce
// byte-identical output, so CI can diff it.
//
// Source format (a deliberately small Markdown subset):
//   ---                       front matter: `key: value` lines. Required keys:
//   title: Privacy Notice       title, kicker, lede, version (YYYY-MM-DD),
//   ...                         effective (YYYY-MM-DD)
//   ---
//   Intro paragraphs          (optional; before the first `## `)
//   ## Section heading
//   ### Sub-heading
//   A paragraph. Consecutive lines join into one paragraph.
//   - A bullet item (continuation lines are indented by two spaces)
//   1. A numbered item (same rules)
//   Inline: **bold** and [link text](href). href is a site path such as
//   /terms, an https:// URL or a mailto: address.
//   <!-- web-only -->         Lines between these two markers (each on a line
//   ...                       of its own) are published on the web only: the
//   <!-- /web-only -->        app module leaves them out. The markers themselves
//                             never end a paragraph or list, so a block can hold
//                             whole sections, paragraphs, list items or a single
//                             sentence line. A block that contains a ## heading
//                             must run to the next ## heading or the end of the
//                             file. Use it for text the app must not show, such
//                             as pointers to buying on the web (App Store
//                             steering rules). No other HTML comments are allowed.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "docs", "legal");

/** Document keys, in display order. Each is docs/legal/<key>.md. */
const DOC_KEYS = [
  "privacy",
  "terms",
  "acceptable-use",
  "terms-of-sale",
  "child-safety",
  "safeguarding",
  "advertising",
  "editorial",
];

/**
 * Every app that renders the legal texts gets a generated module. The web
 * targets get identical output; the app target omits the web-only blocks.
 */
const TARGETS = [
  { path: "frontend/src/content/legal.gen.ts", variant: "web" },
  { path: "mobile/src/content/legal.gen.ts", variant: "app" },
  { path: "marketing/src/content/legal.gen.ts", variant: "web" },
];
const VARIANTS = ["web", "app"];

const REQUIRED_META = ["title", "kicker", "lede", "version", "effective"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

class LegalSourceError extends Error {}

function fail(file, line, message) {
  throw new LegalSourceError(`${relative(ROOT, file)}:${line}: ${message}`);
}

/** "2026-10-01" → "1 October 2026" (no locale or timezone dependence). */
function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function parseFrontMatter(file, lines) {
  if (lines[0] !== "---") fail(file, 1, "missing front matter (the file must start with ---)");
  const meta = {};
  let i = 1;
  for (; i < lines.length && lines[i] !== "---"; i++) {
    const colon = lines[i].indexOf(":");
    const key = colon > 0 ? lines[i].slice(0, colon) : "";
    if (!/^[a-z]+$/.test(key)) fail(file, i + 1, `bad front-matter line: ${lines[i]}`);
    let value = lines[i].slice(colon + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    meta[key] = value;
  }
  if (i === lines.length) fail(file, 1, "front matter is not closed with ---");
  for (const key of REQUIRED_META) {
    if (!meta[key]) fail(file, 1, `front matter needs "${key}"`);
  }
  for (const key of ["version", "effective"]) {
    if (!DATE_RE.test(meta[key])) fail(file, 1, `"${key}" must be YYYY-MM-DD`);
  }
  return { meta, bodyStart: i + 1 };
}

const LINK_HREF_RE = /^(\/|https:\/\/|mailto:)/;

/** Splits inline text into plain, **bold** and [link](href) parts. */
function parseInline(file, line, text) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    if (m[1] === undefined) {
      const href = m[3];
      if (!LINK_HREF_RE.test(href)) fail(file, line, `link must be a /path, https:// URL or mailto: (${href})`);
      parts.push({ text: m[2], href });
    } else {
      parts.push({ text: m[1], bold: true });
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  for (const p of parts) {
    if (p.text.includes("**") || p.text.includes("](")) fail(file, line, "unbalanced ** or link syntax");
  }
  return parts;
}

const LIST_ITEM_RE = /^(?:(-)|\d+\.) (\S.*)$/;

/** A tiny line-based parser for the Markdown subset described above. */
class BodyParser {
  constructor(file) {
    this.file = file;
    this.intro = [];
    this.sections = [];
    this.blocks = this.intro;
    this.para = null; // { line, text }
    this.list = null; // { ordered, items: [{ line, text }] }
  }

  flush() {
    const { file, para, list } = this;
    if (para) this.blocks.push({ kind: "p", parts: parseInline(file, para.line, para.text) });
    if (list) {
      const items = list.items.map((it) => parseInline(file, it.line, it.text));
      this.blocks.push({ kind: list.ordered ? "ol" : "ul", items });
    }
    this.para = null;
    this.list = null;
  }

  /** Handles headings; returns false when the line is not one. */
  heading(n, line) {
    if (!line.startsWith("#")) return false;
    this.flush();
    if (line.startsWith("## ")) {
      this.blocks = [];
      this.sections.push({ heading: line.slice(3).trim(), blocks: this.blocks });
    } else if (line.startsWith("### ")) {
      this.blocks.push({ kind: "h3", text: line.slice(4).trim() });
    } else {
      fail(this.file, n, "only ## and ### headings are supported (the title lives in front matter)");
    }
    return true;
  }

  /** Handles list items and their indented continuation lines. */
  listLine(n, line) {
    const item = LIST_ITEM_RE.exec(line);
    if (item) {
      const ordered = item[1] === undefined;
      if (this.para || (this.list && this.list.ordered !== ordered)) this.flush();
      this.list ??= { ordered, items: [] };
      this.list.items.push({ line: n, text: item[2].trim() });
      return true;
    }
    if (this.list && line.startsWith("  ")) {
      this.list.items.at(-1).text += " " + line.trim();
      return true;
    }
    return false;
  }

  line(n, raw) {
    const line = raw.trimEnd();
    if (line.trim() === "") return this.flush();
    if (this.heading(n, line) || this.listLine(n, line)) return undefined;
    if (this.list) this.flush();
    if (this.para) this.para.text += " " + line.trim();
    else this.para = { line: n, text: line.trim() };
    return undefined;
  }
}

const WEB_ONLY_RE = /^<!--\s*(\/?)web-only\s*-->$/;

/**
 * Applies the web-only markers to the body lines. Returns the 1-based line
 * numbers and text of the lines the variant keeps; the marker lines are
 * dropped without ending a paragraph or list.
 */
function selectVariant(file, lines, start, variant) {
  const kept = [];
  let open = 0; // line number of the open marker, or 0
  let openHasSection = false;
  let openHasContent = false;
  let needSectionAt = 0; // a closed block held a ## heading: the next text must be one
  for (let i = start; i < lines.length; i++) {
    const n = i + 1;
    const text = lines[i].trim();
    const marker = WEB_ONLY_RE.exec(text);
    if (marker) {
      if (marker[1] === "") {
        if (open) fail(file, n, `web-only block opened again before the one on line ${open} was closed`);
        open = n;
        openHasSection = false;
        openHasContent = false;
      } else {
        if (!open) fail(file, n, "<!-- /web-only --> without an opening <!-- web-only -->");
        if (!openHasContent) fail(file, open, "empty web-only block");
        if (openHasSection) needSectionAt = n;
        open = 0;
      }
      continue;
    }
    if (text.startsWith("<!--")) fail(file, n, "only <!-- web-only --> and <!-- /web-only --> comments are supported");
    if (text !== "" && needSectionAt) {
      if (!text.startsWith("## ")) {
        fail(file, needSectionAt, "a web-only block with a ## heading must end just before the next ## heading or at the end of the file");
      }
      needSectionAt = 0;
    }
    if (open) {
      if (text !== "") openHasContent = true;
      if (text.startsWith("## ")) openHasSection = true;
      if (variant !== "web") continue;
    }
    kept.push({ n, text: lines[i] });
  }
  if (open) fail(file, open, "web-only block is not closed with <!-- /web-only -->");
  return kept;
}

function parseBody(file, lines, start, variant) {
  const parser = new BodyParser(file);
  for (const { n, text } of selectVariant(file, lines, start, variant)) parser.line(n, text);
  parser.flush();
  const { intro, sections } = parser;
  if (sections.length === 0) fail(file, start + 1, "a document needs at least one ## section");
  for (const s of sections) {
    if (s.blocks.length === 0) fail(file, start + 1, `section "${s.heading}" is empty`);
  }
  return { intro, sections };
}

function loadDoc(key, variant) {
  const file = join(SOURCE_DIR, `${key}.md`);
  if (!existsSync(file)) fail(file, 1, "missing source document");
  const lines = readFileSync(file, "utf8").replace(/\r\n?/g, "\n").split("\n");
  const { meta, bodyStart } = parseFrontMatter(file, lines);
  const { intro, sections } = parseBody(file, lines, bodyStart, variant);
  return {
    key,
    title: meta.title,
    kicker: meta.kicker,
    lede: meta.lede,
    version: meta.version,
    effective: meta.effective,
    effectiveLabel: longDate(meta.effective),
    intro,
    sections,
  };
}

const VARIANT_NOTE = {
  web: "Web variant: includes the blocks marked <!-- web-only --> in the source.",
  app: "App variant: the blocks marked <!-- web-only --> in the source are left out.",
};

function render(variant, docs) {
  const byKey = Object.fromEntries(docs.map((d) => [d.key, d]));
  const json = (v) => JSON.stringify(v, null, 2);
  return `// GENERATED by scripts/sync-legal.mjs from docs/legal/*.md — do not edit by hand.
// Edit the Markdown source, then run \`node scripts/sync-legal.mjs\`. CI runs it
// with --check and fails when this file is stale.
// ${VARIANT_NOTE[variant]}

export type LegalDocKey = ${DOC_KEYS.map((k) => JSON.stringify(k)).join(" | ")};

/** A run of text: plain, bold, or a link (a site path, https:// URL or mailto:). */
export interface LegalInline {
  readonly text: string;
  readonly bold?: boolean;
  readonly href?: string;
}

export type LegalBlock =
  | { readonly kind: "p"; readonly parts: readonly LegalInline[] }
  | { readonly kind: "h3"; readonly text: string }
  | { readonly kind: "ul" | "ol"; readonly items: readonly (readonly LegalInline[])[] };

export interface LegalSection {
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalDoc {
  readonly key: LegalDocKey;
  readonly title: string;
  readonly kicker: string;
  readonly lede: string;
  /** Version of the text (YYYY-MM-DD). */
  readonly version: string;
  /** Date the text takes effect (YYYY-MM-DD) and its long form. */
  readonly effective: string;
  readonly effectiveLabel: string;
  readonly intro: readonly LegalBlock[];
  readonly sections: readonly LegalSection[];
}

/** Display order of the legal documents. */
export const LEGAL_DOC_KEYS: readonly LegalDocKey[] = ${json(DOC_KEYS)};

/** Current Terms of Use and Privacy Notice versions (the consent record's versions). */
export const LEGAL_TERMS_VERSION = ${JSON.stringify(byKey.terms.version)};
export const LEGAL_PRIVACY_VERSION = ${JSON.stringify(byKey.privacy.version)};

/** The public web portal, where every legal document is published. */
export const LEGAL_PORTAL_ORIGIN = "https://citizen.oguaaman.com";

/** The site path of each legal document on the portal. */
export const legalPath = (key: LegalDocKey): string => \`/\${key}\`;

/** The legal document a site path points at, if any ("/terms" → "terms"). */
export function legalDocKeyForPath(path: string): LegalDocKey | undefined {
  const key = path.replace(/^\\//, "").replace(/[?#].*$/, "");
  return (LEGAL_DOC_KEYS as readonly string[]).includes(key) ? (key as LegalDocKey) : undefined;
}

/** The plain text of a run of inline parts. */
export const legalPlainText = (parts: readonly LegalInline[]): string => parts.map((p) => p.text).join("");

/** A content-derived label for a block (the basis of its React key). */
export function legalBlockLabel(block: LegalBlock): string {
  if (block.kind === "h3") return \`h3:\${block.text}\`;
  if (block.kind === "p") return \`p:\${legalPlainText(block.parts)}\`;
  return \`\${block.kind}:\${block.items.map(legalPlainText).join("|")}\`;
}

/** Pairs each item with a stable key derived from its content (unique within the list). */
export function legalKeyed<T>(items: readonly T[], label: (item: T) => string): [string, T][] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = label(item);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return [n === 0 ? base : \`\${base}#\${n}\`, item];
  });
}

export const LEGAL_DOCS: Readonly<Record<LegalDocKey, LegalDoc>> = ${json(byKey)};
`;
}

function main() {
  const check = process.argv.includes("--check");
  // Every variant is built (and so validated) on every run.
  const outputs = Object.fromEntries(VARIANTS.map((v) => [v, render(v, DOC_KEYS.map((key) => loadDoc(key, v)))]));
  const stale = [];
  for (const { path: target, variant } of TARGETS) {
    const output = outputs[variant];
    const file = join(ROOT, target);
    const current = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (current === output) continue;
    if (check) {
      stale.push(target);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, output);
    console.log(`wrote ${target}`);
  }
  if (stale.length > 0) {
    console.error(`Legal texts are out of date: ${stale.join(", ")}.\nRun 'node scripts/sync-legal.mjs' and commit the result.`);
    process.exit(1);
  }
  if (check) console.log("legal texts are up to date");
}

try {
  main();
} catch (err) {
  if (err instanceof LegalSourceError) {
    console.error(`sync-legal: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
