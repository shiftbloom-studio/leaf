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

/** Detection looks at the first 32 KB only and stays plain text when nothing fits well. */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 32 * 1024);
  const r = hljs.highlightAuto(sample, Object.keys(LANGUAGES).filter((l) => l !== "plaintext"));
  return r.language && r.relevance >= 5 ? r.language : "plaintext";
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Above this size the paste is shown without colours, so a 2 MB log can't eat the Worker's CPU budget. */
export const HIGHLIGHT_LIMIT = 512 * 1024;

/**
 * Highlighted HTML, split into one string per source line. highlight.js spans may cross line breaks
 * (block comments, template strings); they are closed at the end of each line and reopened on the next,
 * so every line can be rendered, linked and selected on its own.
 */
export function highlightLines(text: string, lang: string): string[] {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (lang === "plaintext" || !(lang in LANGUAGES) || body.length > HIGHLIGHT_LIMIT) return body.split("\n").map(escapeHtml);
  let html: string;
  try {
    html = hljs.highlight(body, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return body.split("\n").map(escapeHtml);
  }
  return splitLines(html);
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
