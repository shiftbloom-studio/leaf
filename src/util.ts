// SPDX-License-Identifier: AGPL-3.0-or-later
/** Pure helpers (no bindings), unit-tested in test/util.test.ts. */

/** No 0/O, 1/l/I: ids get read aloud and typed from screenshots. */
export const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 12 characters from 57 symbols is about 70 bits: links can't be guessed, and misses are rate limited on top. */
export const ID_LENGTH = 12;
export const ID_RE = /^[A-Za-z0-9]{12}$/;

export function randomString(len: number, alphabet = ID_ALPHABET) {
  // rejection sampling keeps every symbol equally likely
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < limit) out += alphabet[b % alphabet.length];
      if (out.length === len) break;
    }
  }
  return out;
}

export function timingSafeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- tokens ----------
/** Prefix of named API tokens (issued from an admin hub such as field and stored hashed in D1). */
export const TOKEN_PREFIX = "leaf_";

/** The token a request carries: `Authorization: Bearer <token>`, `X-API-Key`, or a `token` form field (passed in). */
export function requestToken(req: Request, formToken = "") {
  const h = req.headers.get("authorization") || "";
  return (h.startsWith("Bearer ") ? h.slice(7).trim() : req.headers.get("x-api-key") || formToken || "").trim();
}

/** Looks like a named token? Cheap check before touching D1. */
export function isNamedToken(token: string) {
  return token.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_]{20,100}$/.test(token);
}

/** A named token row is usable when it is neither revoked nor past its expiry (unix seconds). */
export function tokenUsable(row: { expires_at: number | null; revoked_at: number | null } | null | undefined, now = Math.floor(Date.now() / 1000)) {
  return !!row && row.revoked_at == null && (row.expires_at == null || row.expires_at > now);
}

/** Who a request acts as. Anonymous visitors have no principal. */
export type Principal = { owner: string; master: boolean };
export const MASTER_OWNER = "master";

// ---------- expiry ----------
export const ANON_MAX_SECONDS = 12 * 3600;
export const EXPIRY: Record<string, number> = { "10m": 600, "1h": 3600, "12h": 43200, "1d": 86400, "7d": 604800, "30d": 2592000, "1y": 31536000 };
export const ANON_EXPIRY = ["10m", "1h", "12h"];
export const TOKEN_EXPIRY = ["10m", "1h", "12h", "1d", "7d", "30d", "1y"];

/**
 * Seconds until a new paste expires, or null for "never" (master token only).
 * Anonymous pastes are capped at 12 hours, named tokens at one year. Unknown values fall back to the default.
 */
export function expirySeconds(v: string | null | undefined, who: Principal | null): number | null {
  const key = (v || "").trim();
  if (key === "never" && who?.master) return null;
  const allowed = who ? TOKEN_EXPIRY : ANON_EXPIRY;
  if (allowed.includes(key)) return EXPIRY[key];
  return who ? EXPIRY["7d"] : EXPIRY["12h"];
}

// ---------- content ----------
export const sanitizeTitle = (t: string | null | undefined) => (t || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

/** Normalise line endings; refuse content that is empty or obviously binary. */
export function cleanContent(text: string): { ok: true; text: string } | { ok: false; error: string } {
  const t = text.replace(/\r\n?/g, "\n");
  if (!t.trim()) return { ok: false, error: "The paste is empty." };
  if (t.includes("\u0000")) return { ok: false, error: "That looks like a binary file. leaf only takes text." };
  return { ok: true, text: t };
}

export const byteLength = (s: string) => new TextEncoder().encode(s).length;
export const lineCount = (s: string) => (s ? s.split("\n").length - (s.endsWith("\n") ? 1 : 0) : 0);

export function fmtSize(n: number) {
  const u = ["B", "KB", "MB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${i ? n.toFixed(1) : n} ${u[i]}`;
}

/** Search engines may find the front page; AI training crawlers are turned away entirely. */
const AI_TRAINING_BOTS = ["GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "Google-Extended", "Applebot-Extended", "Bytespider", "Amazonbot", "meta-externalagent", "cohere-ai", "MistralAI-Training", "Diffbot"];
export const robotsTxt = (origin: string) =>
  [
    "# Pastes are private links and are not meant to be indexed. Search engines and AI answer engines may read",
    "# the start page; training AI models on this site is not allowed.",
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /$",
    "Allow: /llms.txt",
    "Allow: /og.png",
    "Allow: /sitemap.xml",
    "Allow: /privacy",
    "Allow: /imprint",
    "Allow: /datenschutz",
    "Allow: /impressum",
    "Disallow: /",
    "",
    ...AI_TRAINING_BOTS.map((b) => `User-agent: ${b}`),
    "Disallow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

/** Drops trailing slashes in linear time (a `/\/+$/` replace backtracks on long runs of slashes). */
export function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
  return end === s.length ? s : s.slice(0, end);
}
