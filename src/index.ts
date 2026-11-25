// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * leaf: a pastebin on one Cloudflare Worker.
 * D1 holds paste metadata and named tokens, R2 holds the text, and an hourly cron deletes what has expired.
 */
import { handleAsset } from "./assets";
import { brandFrom } from "./brand";
import { detectLanguage, highlightLines, LANGUAGES, normalizeLang } from "./highlight";
import { burnGatePage, configureUi, createdPage, deleteConfirmPage, deletedPage, homePage, messagePage, notFoundPage, viewPage, type Limits, type PasteMeta } from "./html";
import { LEGAL_PATHS, legalPage, parseLegal } from "./legal";
import {
  byteLength, cleanContent, expirySeconds, ID_LENGTH, ID_RE, isNamedToken, lineCount, MASTER_OWNER, randomString, requestToken, robotsTxt,
  sanitizeTitle, sha256Hex, timingSafeEqual, tokenUsable, type Principal,
} from "./util";

export interface Env {
  DB: D1Database;
  PASTES: R2Bucket;
  /** Master token (secret). Optional: without it only anonymous pastes and named tokens work. */
  API_TOKEN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  ABUSE_EMAIL?: string;
  LEGAL?: string;
  MAX_ANON_KB?: string;
  MAX_TOKEN_KB?: string;
  /** Anonymous pastes per UTC day across all visitors (default 5000, 0 = no ceiling). */
  MAX_ANON_PER_DAY?: string;
  BRAND?: string;
  SOURCE_URL?: string;
  OPERATOR_NAME?: string;
  OPERATOR_URL?: string;
  OPERATOR_PLACE?: string;
  /** Per IP and minute: anonymous pastes, failed token attempts, lookups of ids that don't exist. */
  CREATE_RL?: RateLimit;
  AUTH_RL?: RateLimit;
  MISS_RL?: RateLimit;
}

type Row = PasteMeta & { delete_hash: string; owner: string | null; views: number };

const now = () => Math.floor(Date.now() / 1000);
const ip = (req: Request) => req.headers.get("cf-connecting-ip") || "unknown";

const limits = (env: Env): Limits => ({
  anonBytes: Math.max(1, Number(env.MAX_ANON_KB || 256)) * 1024,
  tokenBytes: Math.max(1, Number(env.MAX_TOKEN_KB || 2048)) * 1024,
});

// ---------- responses ----------
const CSP = [
  "default-src 'none'",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "strict-transport-security": "max-age=31536000; includeSubDomains" };

const html = (body: string, status = 200, cache = "no-store") =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "cache-control": cache, ...SECURITY } });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2) + "\n", { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY } });

const apiError = (status: number, error: string) => json({ error }, status);

/** Too many misses from one IP look like someone walking the id space. */
async function missLimited(req: Request, env: Env) {
  return !!env.MISS_RL && !(await env.MISS_RL.limit({ key: ip(req) })).success;
}

// ---------- auth ----------
/**
 * The master token (API_TOKEN secret) or a named `leaf_` token from the api_tokens table that is
 * neither revoked nor expired. Returns undefined when no token was sent, null when a token was sent but is bad.
 */
async function authenticate(token: string, env: Env, ctx: ExecutionContext): Promise<Principal | null | undefined> {
  if (!token) return undefined;
  if (env.API_TOKEN && timingSafeEqual(token, env.API_TOKEN)) return { owner: MASTER_OWNER, master: true };
  if (!isNamedToken(token)) return null;
  const row = await env.DB.prepare("SELECT id, expires_at, revoked_at, last_used_at FROM api_tokens WHERE hash = ?")
    .bind(await sha256Hex(token))
    .first<{ id: string; expires_at: number | null; revoked_at: number | null; last_used_at: number | null }>();
  const t = now();
  if (!row || !tokenUsable(row, t)) return null;
  if (!row.last_used_at || t - row.last_used_at >= 60) ctx.waitUntil(env.DB.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").bind(t, row.id).run());
  return { owner: row.id, master: false };
}

async function verifyTurnstile(env: Env, token: string, req: Request) {
  if (!env.TURNSTILE_SECRET) return true; // not configured: rate limits and size caps still apply
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  body.append("remoteip", ip(req));
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = (await r.json()) as { success?: boolean; hostname?: string };
    return !!j.success && (!j.hostname || j.hostname === new URL(req.url).hostname);
  } catch {
    return false;
  }
}

/**
 * The request body as text, or null once it passes `max` bytes. Works with and without Content-Length,
 * so a chunked upload can't make the Worker buffer more than the cap.
 */
async function readCapped(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") || 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** A global ceiling on anonymous pastes per UTC day (MAX_ANON_PER_DAY), on top of the per-IP limit. */
async function anonQuotaLeft(env: Env) {
  const cap = Number(env.MAX_ANON_PER_DAY || 5000);
  if (!(cap > 0)) return true;
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare("INSERT INTO anon_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(day)
    .first<{ count: number }>();
  return !row || row.count <= cap;
}

// ---------- create ----------
type Draft = { content: string; title: string; lang: string; expires: string; burn: boolean };
type Created = { id: string; url: string; raw: string; deleteUrl: string; title: string; lang: string; expiresAt: number | null; burn: boolean; owned: boolean };

async function createPaste(env: Env, origin: string, d: Draft, who: Principal | null): Promise<Created | { error: string; status: number }> {
  const c = cleanContent(d.content);
  if (!c.ok) return { error: c.error, status: 422 };
  const size = byteLength(c.text);
  const lim = limits(env);
  const max = who ? lim.tokenBytes : lim.anonBytes;
  if (size > max) return { error: `That's ${Math.ceil(size / 1024)} KB. The limit is ${Math.round(max / 1024)} KB${who ? "" : " without a token"}.`, status: 413 };
  const asked = normalizeLang(d.lang);
  if (asked === null) return { error: `Unknown language "${d.lang.slice(0, 40)}". Leave it empty to detect it.`, status: 422 };
  const lang = asked === "auto" ? detectLanguage(c.text) : asked;
  const ttl = expirySeconds(d.expires, who);
  const created = now();
  const expiresAt = ttl == null ? null : created + ttl;
  const id = randomString(ID_LENGTH);
  const deleteKey = randomString(32);
  const title = sanitizeTitle(d.title);
  // Highlight once, now: views then serve the stored HTML, so a paste that is slow to highlight costs CPU once, not per view.
  const rendered = highlightLines(c.text, lang).join("\n");
  try {
    await env.PASTES.put(`p/${id}`, c.text, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
    await env.PASTES.put(`h/${id}`, rendered, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    await env.DB.prepare(
      "INSERT INTO pastes (id, title, lang, size, lines, created_at, expires_at, burn, delete_hash, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, title || null, lang, size, lineCount(c.text), created, expiresAt, d.burn ? 1 : 0, await sha256Hex(deleteKey), who?.owner ?? null)
      .run();
  } catch (e) {
    await env.PASTES.delete([`p/${id}`, `h/${id}`]).catch(() => {}); // no orphaned text without a row
    throw e;
  }
  return { id, url: `${origin}/${id}`, raw: `${origin}/${id}/raw`, deleteUrl: `${origin}/d/${id}/${deleteKey}`, title, lang, expiresAt, burn: d.burn, owned: !!who };
}

/** The web form: Turnstile for anonymous visitors, a token from the hidden field for everyone else. */
async function handleForm(req: Request, env: Env, ctx: ExecutionContext, origin: string) {
  const ct = req.headers.get("content-type") || "";
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)/.test(ct)) return html(notFoundPage(), 415);
  const raw = await readCapped(req, limits(env).tokenBytes * 3 + 65536);
  if (raw == null) return html(homePage({ limits: limits(env), siteKey: siteKey(env), error: "That's too much text for one paste." }), 413);
  const f = await new Response(raw, { headers: { "content-type": ct } }).formData();
  const field = (k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : "");
  const draft: Draft = { content: field("content"), title: field("title"), lang: field("lang"), expires: field("expires"), burn: field("burn") === "1" };
  const again = (error: string, status: number) => html(homePage({ limits: limits(env), siteKey: siteKey(env), error, draft: { ...draft, content: draft.content.slice(0, limits(env).tokenBytes) } }), status);

  const who = await authenticate(requestToken(req, field("token")), env, ctx);
  if (who === null) {
    if (env.AUTH_RL && !(await env.AUTH_RL.limit({ key: ip(req) })).success) return again("Too many tries. Wait a minute, then try again.", 429);
    return again("That token doesn't work. It may be mistyped, expired or revoked.", 401);
  }
  if (!who) {
    if (env.CREATE_RL && !(await env.CREATE_RL.limit({ key: ip(req) })).success) return again("That's a lot of pastes in one minute. Wait a moment, then try again.", 429);
    if (!(await verifyTurnstile(env, field("cf-turnstile-response"), req))) return again("The bot check didn't go through. Try again.", 403);
    if (!(await anonQuotaLeft(env))) return again("leaf has taken all the anonymous pastes it can for today. Try again tomorrow, or use a token.", 503);
  }
  const r = await createPaste(env, origin, draft, who ?? null);
  if ("error" in r) return again(r.error, r.status);
  return html(createdPage(r));
}

/** API: raw body (curl --data-binary) or JSON. Needs a token; anonymous pastes go through the web form and Turnstile. */
async function handleApiCreate(req: Request, env: Env, origin: string, who: Principal) {
  const ct = req.headers.get("content-type") || "";
  const body = await readCapped(req, limits(env).tokenBytes * 2);
  if (body == null) return apiError(413, `the limit is ${Math.round(limits(env).tokenBytes / 1024)} KB`);
  let d: Draft;
  if (ct.startsWith("application/json")) {
    let b: Record<string, unknown> | null = null;
    try { b = JSON.parse(body); } catch {}
    if (!b || typeof b.content !== "string") return apiError(422, 'send JSON like {"content": "..."}');
    d = { content: b.content, title: String(b.title ?? ""), lang: String(b.lang ?? ""), expires: String(b.expires ?? ""), burn: b.burn === true };
  } else {
    const h = req.headers;
    d = { content: body, title: h.get("x-title") || "", lang: h.get("x-lang") || "", expires: h.get("x-expires") || "", burn: h.get("x-burn") === "1" || h.get("x-burn") === "true" };
  }
  const r = await createPaste(env, origin, d, who);
  if ("error" in r) return apiError(r.status, r.error);
  return json({ id: r.id, url: r.url, raw: r.raw, delete: r.deleteUrl, lang: r.lang, expires_at: r.expiresAt, burn: r.burn }, 201);
}

// ---------- read ----------
async function getPaste(env: Env, id: string): Promise<Row | null> {
  const row = await env.DB.prepare("SELECT * FROM pastes WHERE id = ?").bind(id).first<Row>();
  if (!row) return null;
  if (row.expires_at != null && row.expires_at <= now()) return null; // the cron catches up within the hour
  return row;
}

async function getText(env: Env, id: string) {
  const o = await env.PASTES.get(`p/${id}`);
  return o ? o.text() : null;
}

const objectKeys = (id: string) => [`p/${id}`, `h/${id}`];

async function deletePaste(env: Env, id: string) {
  await env.DB.prepare("DELETE FROM pastes WHERE id = ?").bind(id).run();
  await env.PASTES.delete(objectKeys(id));
}

/** The highlighted lines stored at creation. Pastes without them (none yet, but cheap to support) are rendered once and stored. */
async function renderedLines(env: Env, ctx: ExecutionContext | null, row: Row): Promise<string[] | null> {
  const h = await env.PASTES.get(`h/${row.id}`);
  if (h) return (await h.text()).split("\n");
  const text = await getText(env, row.id);
  if (text == null) return null;
  const lines = highlightLines(text, row.lang);
  if (ctx) ctx.waitUntil(env.PASTES.put(`h/${row.id}`, lines.join("\n"), { httpMetadata: { contentType: "text/html; charset=utf-8" } }));
  return lines;
}

async function serveView(env: Env, ctx: ExecutionContext, row: Row, origin: string) {
  if (row.burn) return html(burnGatePage(row));
  const lines = await renderedLines(env, ctx, row);
  if (lines == null) return html(notFoundPage(), 404);
  ctx.waitUntil(env.DB.prepare("UPDATE pastes SET views = views + 1 WHERE id = ?").bind(row.id).run());
  return html(viewPage(row, lines, { url: `${origin}/${row.id}` }), 200, "private, max-age=60");
}

/** Burn after reading: claim the row first, so two people opening the link at once can't both read it. */
async function openBurn(env: Env, row: Row, origin: string) {
  const claimed = await env.DB.prepare("DELETE FROM pastes WHERE id = ? AND burn = 1").bind(row.id).run();
  if (!claimed.meta.changes) return html(notFoundPage(), 404);
  try {
    const lines = await renderedLines(env, null, row);
    if (lines == null) return html(notFoundPage(), 404);
    return html(viewPage(row, lines, { url: `${origin}/${row.id}`, burned: true }));
  } finally {
    await env.PASTES.delete(objectKeys(row.id)); // the row is gone, so the text goes too, whatever happened above
  }
}

async function serveRaw(env: Env, ctx: ExecutionContext, row: Row, download: boolean) {
  if (row.burn) return new Response("This paste can be read once. Open it in a browser.\n", { status: 403, headers: { "content-type": "text/plain; charset=utf-8", ...SECURITY } });
  const o = await env.PASTES.get(`p/${row.id}`);
  if (!o) return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  ctx.waitUntil(env.DB.prepare("UPDATE pastes SET views = views + 1 WHERE id = ?").bind(row.id).run());
  const name = `${(row.title || row.id).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || row.id}.${EXT[row.lang] || "txt"}`;
  return new Response(o.body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // raw text never runs as a page on leaf's origin
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=60",
      ...(download ? { "content-disposition": `attachment; filename="${name}"` } : {}),
      ...SECURITY,
    },
  });
}

const EXT: Record<string, string> = { bash: "sh", c: "c", cpp: "cpp", csharp: "cs", css: "css", diff: "diff", dockerfile: "Dockerfile", go: "go", graphql: "graphql", xml: "html", ini: "ini", java: "java", javascript: "js", json: "json", kotlin: "kt", lua: "lua", makefile: "mk", markdown: "md", nginx: "conf", php: "php", powershell: "ps1", python: "py", ruby: "rb", rust: "rs", scss: "scss", shell: "txt", sql: "sql", swift: "swift", typescript: "ts", yaml: "yaml" };

// ---------- API listing ----------
async function handleList(req: Request, env: Env, origin: string, who: Principal) {
  const u = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || 30));
  const before = Number(u.searchParams.get("before")) || Number.MAX_SAFE_INTEGER;
  const { results } = await env.DB.prepare(
    "SELECT id, title, lang, size, lines, created_at, expires_at, burn, views FROM pastes WHERE owner = ? AND created_at < ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT ?",
  )
    .bind(who.owner, before, now(), limit)
    .all<Row>();
  return json({ pastes: results.map((r) => ({ ...r, burn: !!r.burn, url: `${origin}/${r.id}`, raw: `${origin}/${r.id}/raw` })) });
}

// ---------- cleanup ----------
async function cleanup(env: Env) {
  for (let round = 0; round < 20; round++) {
    const { results } = await env.DB.prepare("SELECT id FROM pastes WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 500").bind(now()).all<{ id: string }>();
    if (!results.length) break;
    const ids = results.map((r) => r.id);
    await env.PASTES.delete(ids.flatMap(objectKeys));
    await env.DB.batch(ids.map((id) => env.DB.prepare("DELETE FROM pastes WHERE id = ?").bind(id)));
  }
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  await env.DB.prepare("DELETE FROM anon_usage WHERE day < ?").bind(weekAgo).run();
}

const siteKey = (env: Env) => (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY : null);

// ---------- router ----------
async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;
  const get = m === "GET" || m === "HEAD";

  if (path === "/" && get) return html(homePage({ limits: limits(env), siteKey: siteKey(env) }), 200, "public, max-age=300");
  if (path === "/new" && m === "POST") return handleForm(req, env, ctx, url.origin);
  if (path === "/robots.txt") return new Response(robotsTxt(url.origin), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/sitemap.xml")
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url></urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/health") return json({ ok: true });
  if (get && (path.startsWith("/assets/") || path.startsWith("/favicon"))) {
    const a = await handleAsset(req, ctx);
    if (a) return a;
  }
  if (LEGAL_PATHS[path] && get) {
    const legal = parseLegal(env.LEGAL);
    if (!legal) return html(notFoundPage(), 404);
    return html(legalPage(LEGAL_PATHS[path], legal, { abuseEmail: env.ABUSE_EMAIL || null, turnstile: !!siteKey(env) }), 200, "public, max-age=3600");
  }

  if (path.startsWith("/api/")) {
    const who = await authenticate(requestToken(req), env, ctx);
    if (!who) {
      if (who === null && env.AUTH_RL && !(await env.AUTH_RL.limit({ key: ip(req) })).success) return apiError(429, "too many attempts, wait a minute");
      return apiError(401, "send Authorization: Bearer <token>. Without a token, use the form on the start page.");
    }
    if (path === "/api/pastes" && m === "POST") return handleApiCreate(req, env, url.origin, who);
    if (path === "/api/pastes" && m === "GET") return handleList(req, env, url.origin, who);
    const one = /^\/api\/pastes\/([A-Za-z0-9]+)$/.exec(path);
    if (one) {
      const row = await getPaste(env, one[1]);
      // someone else's paste looks exactly like a missing one
      if (!row || !(who.master || row.owner === who.owner)) return apiError(404, "not found");
      if (m === "DELETE") { await deletePaste(env, row.id); return json({ deleted: row.id }); }
      if (m === "GET") { const { delete_hash: _d, owner: _o, ...pub } = row; return json({ ...pub, burn: !!row.burn, url: `${url.origin}/${row.id}`, raw: `${url.origin}/${row.id}/raw` }); }
    }
    if (path === "/api/languages" && m === "GET") return json({ languages: LANGUAGES });
    return apiError(404, "unknown endpoint");
  }

  const del = /^\/d\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/.exec(path);
  if (del && (get || m === "POST" || m === "DELETE")) {
    const row = ID_RE.test(del[1]) ? await getPaste(env, del[1]) : null;
    if (!row || !timingSafeEqual(row.delete_hash, await sha256Hex(del[2]))) {
      if (await missLimited(req, env)) return html(messagePage({ title: "Slow down · leaf.", label: "429", h1: "Too many tries<em>.</em>", text: "Wait a minute, then try again." }), 429);
      return m === "DELETE" ? apiError(404, "not found") : html(notFoundPage(), 404);
    }
    // GET only asks: link previews that open a delete link must not delete anything
    if (get) return html(deleteConfirmPage({ id: row.id, title: row.title, key: del[2] }));
    await deletePaste(env, row.id);
    return m === "DELETE" ? json({ deleted: row.id }) : html(deletedPage(row.id));
  }

  const v = /^\/([A-Za-z0-9]+)(?:\/(raw|dl|open))?$/.exec(path);
  if (v && ID_RE.test(v[1]) && (get || (v[2] === "open" && m === "POST"))) {
    const row = await getPaste(env, v[1]);
    if (!row) {
      if (await missLimited(req, env)) return html(messagePage({ title: "Slow down · leaf.", label: "429", h1: "Too many tries<em>.</em>", text: "Wait a minute, then try again." }), 429);
      return html(notFoundPage(), 404);
    }
    if (v[2] === "open") return m === "POST" && row.burn ? openBurn(env, row, url.origin) : Response.redirect(`${url.origin}/${row.id}`, 303);
    if (v[2] === "raw" || v[2] === "dl") return serveRaw(env, ctx, row, v[2] === "dl");
    return serveView(env, ctx, row, url.origin);
  }
  if (v && !ID_RE.test(v[1]) && (await missLimited(req, env))) return html(notFoundPage(), 429);
  return html(notFoundPage(), 404);
}

const INDEXABLE = new Set(["/", "/robots.txt", "/sitemap.xml", "/favicon.svg", "/privacy", "/datenschutz", "/imprint", "/impressum"]);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    try {
      configureUi({ legal: !!parseLegal(env.LEGAL), abuseEmail: env.ABUSE_EMAIL || null, brand: brandFrom(env) });
      const res = await route(req, env, ctx);
      const path = new URL(req.url).pathname;
      if (INDEXABLE.has(path) || path.startsWith("/assets/")) return res;
      // pastes, raw text, the API and 404s stay out of search engines
      const r = new Response(res.body, res);
      r.headers.set("x-robots-tag", "noindex, nofollow");
      if (path.startsWith("/api/")) r.headers.set("vary", "authorization");
      return r;
    } catch (e) {
      console.error("unhandled", String(e), (e as Error)?.stack);
      return apiError(500, "internal error");
    }
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
