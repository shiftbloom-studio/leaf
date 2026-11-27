// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Server-side syntax highlighting with highlight.js. Pastes arrive in the browser already coloured,
 * so the page needs no highlighter script and works without JavaScript.
 * Only the languages below are bundled, which keeps the Worker small and auto-detection fast.
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import makefile from "highlight.js/lib/languages/makefile";
import markdown from "highlight.js/lib/languages/markdown";
import nginx from "highlight.js/lib/languages/nginx";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/** Language id → label shown in the picker. Order is the picker order. */
export const LANGUAGES: Record<string, string> = {
  plaintext: "Plain text",
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  dockerfile: "Dockerfile",
  go: "Go",
  graphql: "GraphQL",
  xml: "HTML / XML",
  ini: "INI / TOML",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  lua: "Lua",
  makefile: "Makefile",
  markdown: "Markdown",
  nginx: "nginx",
  php: "PHP",
  powershell: "PowerShell",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  shell: "Shell session",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  yaml: "YAML",
};

const DEFS = { bash, c, cpp, csharp, css, diff, dockerfile, go, graphql, ini, java, javascript, json, kotlin, lua, makefile, markdown, nginx, php, plaintext, powershell, python, ruby, rust, scss, shell, sql, swift, typescript, xml, yaml };
for (const [name, def] of Object.entries(DEFS)) hljs.registerLanguage(name, def);

/** Common aliases people type in the API (`x-lang: ts`) map to a bundled language. */
const ALIASES: Record<string, string> = { sh: "bash", zsh: "bash", js: "javascript", jsx: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript", py: "python", rb: "ruby", rs: "rust", "c++": "cpp", cs: "csharp", html: "xml", svg: "xml", toml: "ini", yml: "yaml", md: "markdown", ps1: "powershell", docker: "dockerfile", text: "plaintext", txt: "plaintext", plain: "plaintext", kt: "kotlin", golang: "go", console: "shell", patch: "diff" };

/** A bundled language id for user input, "auto" when we should detect, or null for unknown input. */
export function normalizeLang(v: string | null | undefined): string | null {
  const k = (v || "").trim().toLowerCase();
  if (!k || k === "auto") return "auto";
  if (k in LANGUAGES) return k;
  return ALIASES[k] ?? null;
}

/** Detection looks at up to 4 KB from the start and stays plain text when nothing fits well. */
/**
 * Strong, cheap signals first. highlight.js's own detection is unreliable on a few lines of code
 * (a Python for-loop scores as SCSS), so obvious cases are settled by these patterns.
 */
const SIGNALS: [string, RegExp][] = [
  ["diff", /^(diff --git |--- a\/|\+\+\+ b\/|@@ -\d+(,\d+)? \+\d+(,\d+)? @@)/m],
  ["php", /<\?php\b/],
  ["dockerfile", /^FROM\s+\S+(\s+AS\s+\w+)?\s*$[\s\S]*^(RUN|COPY|CMD|ENTRYPOINT|WORKDIR)\s/im],
  ["go", /^package\s+\w+\s*$[\s\S]*^(import|func)\b/m],
  ["java", /^package\s+[\w.]+;\s*$/m],
  ["kotlin", /^package\s+[\w.]+\s*$[\s\S]*^(import\s+[\w.]+|fun\s|class\s|object\s)/m],
  ["rust", /^\s*(pub\s+)?fn\s+\w+[^\n]*(->|\{)[\s\S]*(\blet\s+(mut\s+)?\w+|::|println!)/m],
  ["python", /^\s*(def\s+\w+\s*\(.*\)\s*(->\s*[^:]+)?:|class\s+\w+(\([^)]*\))?\s*:|elif\s.+:|except(\s+\w+(\s+as\s+\w+)?)?\s*:|from\s+[\w.]+\s+import\s|for\s+\w+(\s*,\s*\w+)*\s+in\s+.+:|with\s+.+\s+as\s+\w+\s*:)\s*$/m],
  ["python", /^(from\s+[\w.]+\s+import\s+[\w*(]|import\s+[\w.]+(\s+as\s+\w+)?\s*$)/m],
  ["typescript", /(?:^\s*(export\s+)?(interface|type)\s+\w+(<[^>]*>)?\s*(=|\{))|\b(const|let|function)\b[^\n]*:\s*(string|number|boolean|unknown|void)\b/m],
  ["javascript", /^\s*(const|let|var)\s+[\w{}\[\], ]+\s*=|\bconsole\.log\(|=>\s*[{(]|^\s*(import\s.+\sfrom\s+['"]|module\.exports\b|require\(['"])/m],
  ["sql", /^\s*(SELECT\s.+\sFROM\s|INSERT\s+INTO\s|CREATE\s+(TABLE|INDEX|VIEW)\s|UPDATE\s+\w+\s+SET\s|DELETE\s+FROM\s|ALTER\s+TABLE\s)/im],
  ["cpp", /^\s*#include\s*<[\w./]+>[\s\S]*(\bstd::|\bclass\s|\btemplate\s*<|\bnamespace\s)/m],
  ["c", /^\s*#include\s*[<"][\w./]+[>"]/m],
  ["xml", /^\s*(<!doctype\s+html|<html[\s>]|<\?xml\s|<svg[\s>])/im],
];

/** A language when the text clearly is one; JSON is checked by parsing it. */
function obviousLanguage(sample: string, full: string): string | null {
  const first = sample.split("\n", 1)[0];
  const shebang = /^#!.*\b(python3?|bash|sh|zsh|node|deno|bun|ruby|php|lua)\b/.exec(first);
  if (shebang) return { python: "python", python3: "python", bash: "bash", sh: "bash", zsh: "bash", node: "javascript", deno: "typescript", bun: "typescript", ruby: "ruby", php: "php", lua: "lua" }[shebang[1]] ?? null;
  const t = full.trim();
  if ((t.startsWith("{") || t.startsWith("[")) && t.length <= 512 * 1024) {
    try { JSON.parse(t); return "json"; } catch {}
  }
  for (const [lang, re] of SIGNALS) if (re.test(sample)) return lang;
  return null;
}

/**
 * Detection looks at up to 4 KB from the start and stays plain text when nothing fits well:
 * first the signals above, then highlight.js, whose guess only counts with a clear lead over the runner-up.
 */
export function detectLanguage(text: string): string {
  // a small sample without pathological lines: detection runs every grammar over it
  const sample = text.split("\n", 400).filter((l) => !plainLine(l) && l.length <= 300).join("\n").slice(0, 4096);
  if (sample.trim().length < 8) return "plaintext";
  const obvious = obviousLanguage(sample, text);
  if (obvious) return obvious;
  const r = hljs.highlightAuto(sample, Object.keys(LANGUAGES).filter((l) => l !== "plaintext"));
  if (!r.language || r.relevance < 5) return "plaintext";
  if (r.secondBest?.language && r.relevance - (r.secondBest.relevance ?? 0) < 2) return "plaintext";
  return r.language;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Above this size the paste is shown without colours. */
export const HIGHLIGHT_LIMIT = 256 * 1024;
/** highlight.js gets slow (worse than linear) on very long lines and very long words; those lines stay plain. */
const MAX_LINE = 1000;
const LONG_WORD = /[^\s"'`()[\]{}<>,;:=+\-*/\\|&!?.]{120}/;
/** Lines are highlighted in segments of about this many characters, cut at blank lines where possible. */
const SEGMENT = 4096;

const plainLine = (l: string) => l.length > MAX_LINE || LONG_WORD.test(l);

/**
 * Highlighted HTML, one string per source line. highlight.js spans may cross line breaks
 * (block comments, template strings); they are closed at the end of each line and reopened on the next,
 * so every line can be rendered, linked and selected on its own.
 *
 * The text is highlighted in segments, and pathological lines are left plain, so the cost stays close
 * to linear in the paste size. A block comment that crosses a segment boundary can lose its colour.
 */
export function highlightLines(text: string, lang: string): string[] {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const lines = body.split("\n");
  if (lang === "plaintext" || !(lang in LANGUAGES) || body.length > HIGHLIGHT_LIMIT) return lines.map(escapeHtml);
  const out: string[] = [];
  let seg: string[] = [];
  let segLen = 0;
  const flush = () => {
    if (!seg.length) return;
    const src = seg.join("\n");
    try {
      const html = splitLines(hljs.highlight(src, { language: lang, ignoreIllegals: true }).value);
      if (html.length === seg.length) out.push(...html);
      else out.push(...seg.map(escapeHtml));
    } catch {
      out.push(...seg.map(escapeHtml));
    }
    seg = [];
    segLen = 0;
  };
  for (const l of lines) {
    if (plainLine(l)) { flush(); out.push(escapeHtml(l)); continue; }
    if (segLen >= SEGMENT && (l.trim() === "" || segLen >= SEGMENT * 2)) flush();
    seg.push(l);
    segLen += l.length + 1;
  }
  flush();
  return out;
}

/** Split highlight.js output on newlines while keeping open spans balanced on every line. */
export function splitLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let cur = "";
  const re = /(<span[^>]*>)|(<\/span>)|(\n)/g;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    cur += html.slice(last, m.index);
    last = re.lastIndex;
    if (m[1]) { open.push(m[1]); cur += m[1]; }
    else if (m[2]) { open.pop(); cur += m[2]; }
    else {
      lines.push(cur + "</span>".repeat(open.length));
      cur = open.join("");
    }
  }
  lines.push(cur + html.slice(last));
  return lines;
}
