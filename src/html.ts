// SPDX-License-Identifier: AGPL-3.0-or-later
import { bloomSvg } from "./bloom";
import { brandFrom, type Brand } from "./brand";
import { LANGUAGES } from "./highlight";
import { fmtSize } from "./util";

/* leaf: UI following the shiftbloom studio brand book v2.
 * Paper and ink with one loud flower. Code always sits on ink; Bloom Red marks actions and seeds,
 * and the only gradient is inside the mark.
 * Voices: Clash Display (headlines), General Sans (UI), JetBrains Mono (code, labels, numbers). */

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const isoTime = (s: number) => `<time datetime="${new Date(s * 1000).toISOString()}">${new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</time>`;

const css = `
:root{--bloom:#FF2E52;--root:#C81040;--petal:#FF8FAB;--blush:#FFE9EF;--ink:#1A1216;--ink60:rgba(26,18,22,.66);--ink40:rgba(26,18,22,.42);--line:#ece4e6;--paper:#fff;--warm:#FAF6F4;--on-ink:#F4EDEE;--on-ink50:rgba(244,237,238,.5);
--display:"Clash Display",ui-sans-serif,system-ui,sans-serif;--sans:"General Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
--ease:cubic-bezier(.22,1.1,.36,1);--settle:cubic-bezier(.4,0,.2,1)}
*{box-sizing:border-box}[hidden]{display:none!important}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--sans);-webkit-font-smoothing:antialiased}
::selection{background:var(--blush)}
a{color:var(--root);text-decoration:none;background:linear-gradient(var(--root),var(--root)) 0 100%/0 1px no-repeat;transition:background-size .24s var(--ease)}
a:hover{background-size:100% 1px}
.wrap{max-width:1120px;margin:0 auto;padding:0 clamp(20px,5vw,48px)}
.label{font:500 11px/1.4 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink60)}
.label.red{color:var(--root)}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px;color:var(--ink);background:none}
.brand .word{font:600 20px/1 var(--display);letter-spacing:-.02em}@media(min-width:640px){.brand .word{font-size:22.4px}}
.brand .word i{font-style:normal;color:var(--bloom)}
h1,h2{font-family:var(--display);font-weight:600;letter-spacing:-.025em;line-height:1.04;margin:0}
h1{font-size:clamp(30px,4.4vw,48px)}h1 em{font-style:normal;color:var(--bloom)}
h2{font-size:22px;line-height:1.15}
.btn{appearance:none;border:0;border-radius:999px;background:var(--root);color:#fff;font:600 15px/1 var(--sans);padding:13px 20px;cursor:pointer;transition:background .24s var(--settle),transform .24s var(--ease);display:inline-flex;align-items:center;gap:8px;text-decoration:none;white-space:nowrap}
.btn:hover{background:var(--ink);background-size:auto}.btn:active{transform:scale(.97)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.btn.ghost:hover{background:var(--ink);color:#fff}
.btn.sm{padding:9px 14px;font-size:13px}
.btn:focus-visible,a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--root);outline-offset:2px}
.sb{font:600 15px/1 var(--display);letter-spacing:-.02em;color:var(--ink);background:none;white-space:nowrap}.sb span{font-weight:400;color:var(--ink60);margin-left:.28em}.sb i{font-style:normal;color:var(--bloom)}
input,textarea,select{font:15px/1.5 var(--sans);color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;width:100%;transition:border-color .24s var(--settle),box-shadow .24s var(--settle)}
input:focus,textarea:focus,select:focus{outline:0;border-color:var(--bloom);box-shadow:0 0 0 3px var(--blush)}
.seedlist{list-style:none;padding:0;margin:0}.seedlist li{position:relative;padding-left:18px}.seedlist li:before{content:"";position:absolute;left:2px;top:.68em;width:7px;height:7px;border-radius:50%;background:var(--bloom)}
.foot{display:flex;justify-content:space-between;gap:12px 24px;flex-wrap:wrap;padding:22px 0 30px;margin-top:72px;border-top:1px solid var(--line)}.foot p{margin:0;font-size:14px;color:var(--ink60)}
@keyframes unfold{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`;

/* Code on ink. Token colours are pinks and whites from the palette, never a second hue. */
const CODE_CSS = `
.code{background:var(--ink);color:var(--on-ink);border-radius:20px;overflow:hidden;animation:unfold .6s var(--ease) both}
.codebar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 12px 10px 20px;border-bottom:1px solid rgba(244,237,238,.1)}
.codebar .label{color:var(--on-ink50)}
.codebar button{appearance:none;border:0;border-radius:999px;background:rgba(255,255,255,.1);color:var(--on-ink);font:500 12px/1 var(--mono);padding:8px 12px;cursor:pointer}
.codebar button:hover{background:var(--root)}
.codebar button[aria-pressed=true]{background:rgba(255,46,82,.3)}
pre{margin:0;overflow:auto;max-height:80vh;font:13px/1.7 var(--mono);tab-size:4;padding:16px 0}
pre code{display:block;min-width:max-content}
pre.wrap code{min-width:0}pre.wrap .ln{white-space:pre-wrap;word-break:break-word}
.ln{display:block;white-space:pre;padding:0 20px 0 0}
.ln .n{display:inline-block;width:5ch;margin-right:16px;text-align:right;color:rgba(244,237,238,.3);user-select:none;-webkit-user-select:none;cursor:pointer;background:none}
.ln .n:hover{color:var(--on-ink)}
.ln.on{background:rgba(255,46,82,.16)}.ln.on .n{color:var(--petal)}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-meta .hljs-keyword,.hljs-doctag{color:#FF8FAB}
.hljs-string,.hljs-attr,.hljs-template-tag,.hljs-regexp,.hljs-selector-attr{color:#FFC2D3}
.hljs-number,.hljs-literal,.hljs-symbol,.hljs-bullet{color:#FF7E9E}
.hljs-comment,.hljs-quote{color:rgba(244,237,238,.45);font-style:italic}
.hljs-title,.hljs-section,.hljs-name,.hljs-selector-id,.hljs-selector-class{color:#fff;font-weight:500}
.hljs-type,.hljs-variable,.hljs-params,.hljs-property,.hljs-attribute{color:#FFDCE7}
.hljs-tag,.hljs-meta,.hljs-punctuation,.hljs-operator{color:rgba(244,237,238,.62)}
.hljs-addition{color:#FFDCE7;background:rgba(255,46,82,.14)}.hljs-deletion{color:#FF8FAB;background:rgba(255,46,82,.26)}
.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:600}
`;

export type Ui = { legal: boolean; abuseEmail: string | null; brand: Brand; origin?: string };
let UI: Ui = { legal: false, abuseEmail: null, brand: brandFrom() };
/** Set once per request from the Worker's config. */
export function configureUi(c: Ui) { UI = c; }
export const ui = () => UI;

/**
 * Canonical URL, link preview (Open Graph, Twitter) and JSON-LD for the start page. Only indexable
 * landing pages pass a description to head(), so pastes and other pages never get these tags.
 */
function landingMeta(title: string, description: string) {
  const origin = UI.origin;
  if (!origin) return "";
  const o = UI.brand.operator;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "leaf",
    url: `${origin}/`,
    description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    inLanguage: "en",
    isAccessibleForFree: true,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    ...(o ? { publisher: { "@type": "Organization", ...(o.url ? { "@id": `${o.url.replace(/\/+$/, "")}/#org`, url: o.url } : {}), name: o.name } } : {}),
    sameAs: [UI.brand.sourceUrl],
  };
  const img = `${origin}/og.png`;
  return `<link rel="canonical" href="${esc(origin)}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(o?.name ?? "leaf")}"><meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(origin)}/">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="leaf. Share code by link.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

/** Plain-text summary for AI answer engines (https://llmstxt.org). */
export function llmsTxt(origin: string) {
  const o = UI.brand.operator;
  return `# leaf

> leaf is a small, self-hostable pastebin for code and logs${o ? `, run here by ${o.name}` : ""}. It runs on Cloudflare Workers with D1 and R2. Licensed AGPL-3.0-or-later. Source: ${UI.brand.sourceUrl}

- Purpose: paste text, get a link to share. Server-side highlighting for 30 languages, line links (#L12-L20), optional "delete after the first read".
- Anonymous pastes need a bot check and are deleted after 10 minutes, 1 hour or 12 hours at the latest; up to 256 KB. Pastes made with an API token can stay up to a year.
- Pastes are only reachable by their link. There is no public list or search, and paste pages send X-Robots-Tag: noindex.

## Pages

- [Start page](${origin}/): write a new paste
${UI.legal ? `- [Privacy](${origin}/privacy) ([Datenschutz, German](${origin}/datenschutz))\n- [Imprint](${origin}/imprint) ([Impressum, German](${origin}/impressum))\n` : ""}`;
}

export const head = (title: string, o: { extraHead?: string; css?: string; index?: boolean; lang?: string; description?: string } = {}) => `<!doctype html><html lang="${o.lang || "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${o.index ? "" : `<meta name="robots" content="noindex, nofollow">`}${o.description ? `<meta name="description" content="${esc(o.description)}">` : ""}<meta name="theme-color" content="#ffffff"><meta name="referrer" content="no-referrer">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/fonts.css">${o.description ? landingMeta(title, o.description) : ""}${o.extraHead || ""}<style>${css}${o.css || ""}</style></head>`;

function operatorMark() {
  const o = UI.brand.operator;
  if (!o) return "";
  const inner = UI.brand.studioWordmark ? `shiftbloom<span>studio</span><i>.</i>` : esc(o.name);
  return o.url ? `<a class="sb" href="${esc(o.url)}" aria-label="${esc(o.name)}">${inner}</a>` : `<span class="sb">${inner}</span>`;
}

export const topbar = (right = "") => `<header class="top"><a class="brand" href="/" aria-label="leaf, new paste">${bloomSvg({ size: 30, id: "tb" })}<span class="word">leaf<i>.</i></span></a>${right}</header>`;

/** AGPL section 13: people using leaf over the network are offered its source. */
export const footer = (lang: "en" | "de" = "en") => {
  const de = lang === "de";
  const legal = UI.legal ? (de ? ` · <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a>` : ` · <a href="/privacy">Privacy</a> · <a href="/imprint">Imprint</a>`) : "";
  const o = UI.brand.operator;
  return `<footer class="foot"><p>${de ? "leaf ist Open Source unter AGPL-3.0-or-later." : "leaf is open source under AGPL-3.0-or-later."} <a href="${esc(UI.brand.sourceUrl)}">${de ? "Zum Code" : "Read the code"}</a>${legal}</p>${o ? `<p>${operatorMark()}${o.place ? ` · ${esc(o.place)}` : ""}</p>` : ""}</footer>`;
};

const page = (title: string, body: string, o: Parameters<typeof head>[1] & { foot?: "en" | "de" } = {}) =>
  `${head(title, o)}<body><div class="wrap">${body}${footer(o.foot || "en")}</div><script src="/assets/app.js" defer></script></body></html>`;

// ---------- new paste ----------
export type Limits = { anonBytes: number; tokenBytes: number };

const HOME_CSS = `
.new{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;padding:clamp(28px,4vw,44px) 0 0;align-items:start}
.intro{grid-column:1/-1;display:flex;justify-content:space-between;align-items:flex-end;gap:12px 32px;flex-wrap:wrap}
.intro p{margin:10px 0 0;color:var(--ink60);max-width:36em}
.editor{background:var(--ink);border-radius:20px;overflow:hidden}
.editor textarea{display:block;width:100%;min-height:min(62vh,640px);background:transparent;color:var(--on-ink);border:0;border-radius:0;padding:20px 22px;font:13px/1.7 var(--mono);tab-size:4;resize:vertical;caret-color:var(--bloom)}
.editor textarea::placeholder{color:rgba(244,237,238,.35)}
.ed{position:relative}
.ed .hl{position:absolute;inset:0;margin:0;padding:20px 22px;font:13px/1.7 var(--mono);tab-size:4;white-space:pre;overflow:hidden;color:var(--on-ink);pointer-events:none;max-height:none}
.ed .hl,.ed textarea{letter-spacing:0;word-spacing:0}
.ed textarea{position:relative;white-space:pre;overflow:auto}
.ed.live textarea{color:transparent;-webkit-text-fill-color:transparent}
.ed.live textarea::selection{background:rgba(255,46,82,.35);-webkit-text-fill-color:transparent}
.editor textarea:focus{box-shadow:none}
.editor:focus-within{box-shadow:0 0 0 3px var(--blush)}
.editor .bar{display:flex;justify-content:space-between;gap:12px;padding:10px 20px;border-top:1px solid rgba(244,237,238,.1)}
.editor .bar .label{color:var(--on-ink50)}.editor .bar .over{color:var(--petal)}
.side{display:grid;gap:16px;position:sticky;top:20px}
.f{display:grid;gap:6px;font:500 14px/1.3 var(--sans)}
.check{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45}.check input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--root);flex:none}
.check small{display:block;color:var(--ink60);font-size:13px}
.side .btn{justify-content:center;width:100%}
.hint{font-size:13px;color:var(--ink60);margin:0}
.err{color:var(--root);font-size:14px;margin:0}
details.tok{border-top:1px solid var(--line);padding-top:14px}
details.tok summary{cursor:pointer;font-size:14px;color:var(--ink60);list-style:none}details.tok summary::-webkit-details-marker{display:none}
details.tok summary:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--bloom);margin-right:9px;vertical-align:1px}
details.tok[open] summary{margin-bottom:10px}
.tokrow{display:flex;gap:8px}.tokrow input{font:13px/1.4 var(--mono)}
.authed .anon-only,html:not(.authed) .token-only{display:none!important}
#mine{grid-column:1/-1;margin-top:20px}
#mine ul{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:2px}
#mine li{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)}
#mine li a:first-child{font-weight:500;overflow-wrap:anywhere}#mine .del{margin-left:auto}
@media (max-width:860px){.new{grid-template-columns:1fr}.side{position:static}.editor textarea{min-height:40vh}}
`;

export function homePage(o: { limits: Limits; siteKey: string | null; error?: string; draft?: { content: string; title: string; lang: string; expires: string; burn: boolean } }) {
  const d = o.draft;
  const langOpts = [`<option value="auto">Detect automatically</option>`, ...Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}"${d?.lang === k ? " selected" : ""}>${esc(v)}</option>`)].join("");
  const expOpts = [["10m", "10 minutes"], ["1h", "1 hour"], ["12h", "12 hours"]].map(([k, v]) => `<option value="${k}"${(d?.expires || "12h") === k ? " selected" : ""}>${v}</option>`).join("");
  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  const ts = o.siteKey
    ? `<div id="ts" class="anon-only" data-sitekey="${esc(o.siteKey)}"><div id="ts-box"></div></div>`
    : "";
  const body = `${topbar()}
<main>
<form id="new" class="new" method="post" action="/new" data-long="1d,7d,30d,1y" data-max-anon="${o.limits.anonBytes}" data-max-token="${o.limits.tokenBytes}">
<div class="intro"><div><span class="label red">new paste</span><h1 style="margin-top:8px">Share code by link<em>.</em></h1>
<p class="anon-only">Anyone with the link can read the paste, and nobody else can find it. Without a token it is deleted after 12 hours at the latest.</p>
<p class="token-only">You're using a token, so pastes can stay up to a year and show up in your list below.</p></div></div>
<div class="editor"><label for="content" class="label" style="position:absolute;left:-9999px">Paste content</label><div class="ed" id="ed"><pre class="hl" id="hl" aria-hidden="true"></pre><textarea id="content" name="content" wrap="off" required spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Paste or type here. Ctrl+Enter creates the paste.">${esc(d?.content || "")}</textarea></div>
<div class="bar"><span class="label" id="count">up to ${kb(o.limits.anonBytes)}</span><span class="label">utf-8 text</span></div></div>
<div class="side">
<label class="f">Title <input name="title" maxlength="120" placeholder="Optional" value="${esc(d?.title || "")}"></label>
<label class="f">Language <select name="lang" id="lang">${langOpts}</select></label>
<label class="f">Delete after <select id="expires" name="expires">${expOpts}</select></label>
<label class="check"><input type="checkbox" name="burn" value="1"${d?.burn ? " checked" : ""}><span>Delete after the first read<small>The link works once. Opening it shows the paste and deletes it.</small></span></label>
${ts}
<input type="hidden" name="token" id="token" value="">
${o.error ? `<p class="err" role="alert">${esc(o.error)}</p>` : ""}
<button class="btn" type="submit">Create paste</button>
<details class="tok anon-only" id="token-field"><summary>I have a token</summary>
<p class="hint" style="margin-bottom:10px">Tokens allow up to ${kb(o.limits.tokenBytes)} and keep pastes for up to a year. Your browser remembers the token.</p>
<div class="tokrow"><input id="token-input" type="password" autocomplete="off" placeholder="leaf_…" aria-label="Token"><button class="btn sm" type="button" id="token-save">Use</button></div>
<p class="err" id="token-err" hidden>That token doesn't work. It may be mistyped, expired or revoked.</p></details>
<p class="hint token-only">Token saved in this browser. <a href="#" id="token-forget">Forget it</a></p>
</div>
<section id="mine" hidden><span class="label" id="mine-h">Made in this browser</span><ul></ul></section>
</form>
</main>`;
  return page(UI.brand.siteTitle, body, {
    index: true,
    description: UI.brand.description,
    css: CODE_CSS + HOME_CSS,
    extraHead: o.siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&amp;onload=leafTurnstile" async defer></script>` : "",
  });
}

// ---------- created ----------
const SHARE_CSS = `
.done{max-width:44em;padding:clamp(32px,6vw,64px) 0 0}
.done p{color:var(--ink60);margin:12px 0 0}
.box{display:flex;align-items:center;gap:10px;background:var(--ink);color:var(--on-ink);border-radius:14px;padding:10px 10px 10px 18px;margin:12px 0 0}
.box code{flex:1;font:500 14px/1.5 var(--mono);word-break:break-all}
.box button{appearance:none;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:var(--on-ink);font:500 12px/1 var(--mono);padding:9px 13px;cursor:pointer}.box button:hover{background:var(--root)}
.done .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}
.done h2{margin-top:36px}
`;

export function createdPage(p: { id: string; url: string; deleteUrl: string; title: string; lang: string; expiresAt: number | null; burn: boolean; owned: boolean }) {
  const remember = JSON.stringify({ id: p.id, url: p.url, del: p.deleteUrl, title: p.title, lang: LANGUAGES[p.lang] || p.lang, expires: p.expiresAt ? p.expiresAt * 1000 : 0, owned: p.owned }).replace(/</g, "\\u003c");
  const body = `${topbar(`<a class="btn ghost sm" href="/">New paste</a>`)}
<main class="done"><span class="label red">paste created</span><h1 style="margin-top:8px">Here's your link<em>.</em></h1>
<p>${p.burn ? "It works once: the first person to open it sees the paste, and then it's gone." : "Anyone with this link can read the paste."} ${p.expiresAt ? `It's deleted on ${isoTime(p.expiresAt)}.` : "It doesn't expire."}</p>
<div class="box"><code>${esc(p.url)}</code><button type="button" data-copy="${esc(p.url)}">Copy</button></div>
<div class="row">${p.burn ? "" : `<a class="btn" href="${esc(p.url)}">Open paste</a>`}<a class="btn ghost" href="/">New paste</a></div>
<h2>Delete link</h2>
<p>Keep this one to yourself. ${p.owned ? "You can also delete the paste from your list." : "We show it only now, and this browser keeps a copy on the start page."}</p>
<div class="box"><code>${esc(p.deleteUrl)}</code><button type="button" data-copy="${esc(p.deleteUrl)}">Copy</button></div>
<script type="application/json" id="made">${remember}</script>
</main>`;
  return page("Paste created · leaf.", body, { css: SHARE_CSS });
}

// ---------- view ----------
export type PasteMeta = { id: string; title: string | null; lang: string; size: number; lines: number; created_at: number; expires_at: number | null; burn: number };

const VIEW_CSS = `
main{padding:clamp(28px,4vw,44px) 0 0}
.titlebar{display:flex;align-items:flex-end;justify-content:space-between;gap:16px 20px;flex-wrap:wrap;margin-bottom:20px}
.titlebar h1{overflow-wrap:anywhere}
.titlebar .row{display:flex;gap:10px;flex-wrap:wrap}
.meta{display:flex;gap:10px 22px;flex-wrap:wrap;align-items:center;margin-top:16px}
.meta .report{margin-left:auto}
.burned{background:var(--blush);border-radius:14px;padding:12px 18px;margin-bottom:16px;font-size:14px}
`;

export function viewPage(p: PasteMeta, lines: string[], o: { url: string; burned?: boolean }) {
  const name = p.title || p.id;
  const code = lines.map((l, i) => `<span class="ln" id="L${i + 1}"><a class="n" href="#L${i + 1}" aria-hidden="true" tabindex="-1">${i + 1}</a>${l}</span>`).join("");
  const langLabel = LANGUAGES[p.lang] || p.lang;
  const report = UI.abuseEmail && !o.burned
    ? `<a class="label report" href="mailto:${esc(UI.abuseEmail)}?subject=${encodeURIComponent(`Report: leaf paste ${p.id}`)}&amp;body=${encodeURIComponent(`${o.url}\n\nWhat is wrong with this paste?\n`)}">Report this paste</a>`
    : "";
  const actions = o.burned
    ? `<a class="btn" href="/">New paste</a>`
    : `<a class="btn ghost" href="/${p.id}/raw">Raw</a><a class="btn ghost" href="/${p.id}/dl">Download</a><a class="btn" href="/">New paste</a>`;
  const body = `${topbar()}
<main>
<div class="titlebar"><div><span class="label red">${esc(langLabel)}</span><h1 style="margin-top:8px">${esc(name)}</h1></div><div class="row">${actions}</div></div>
${o.burned ? `<p class="burned">This paste has been deleted now that you've opened it. Copy what you need before you leave the page.</p>` : ""}
<div class="code"><div class="codebar"><span class="label">${p.lines} ${p.lines === 1 ? "line" : "lines"} · ${fmtSize(p.size)}</span><span><button type="button" id="wrap" aria-pressed="false">Wrap</button> <button type="button" data-copy-code>Copy</button></span></div>
<pre id="code"><code>${code}</code></pre></div>
<div class="meta"><span class="label">created ${isoTime(p.created_at)}</span>${o.burned ? "" : p.expires_at ? `<span class="label red">expires ${isoTime(p.expires_at)}</span>` : `<span class="label">kept until deleted</span>`}${report}</div>
</main>`;
  return page(`${name} · leaf.`, body, { css: CODE_CSS + VIEW_CSS });
}

/** Burn-after-reading pastes ask first, so link previews and scanners can't use up the one read. */
export function burnGatePage(p: Pick<PasteMeta, "id" | "title" | "lines" | "size">) {
  const body = `${topbar()}
<main class="nf"><div><span class="label red">read once</span><h1 style="margin-top:12px">${esc(p.title || "This paste")} can be opened once<em>.</em></h1>
<p>When you open it, it's deleted. ${p.lines} ${p.lines === 1 ? "line" : "lines"}, ${fmtSize(p.size)}.</p>
<form method="post" action="/${p.id}/open"><button class="btn" type="submit">Open and delete</button></form></div></main>`;
  return page("Read once · leaf.", body, { css: NF_CSS });
}

const NF_CSS = `.nf{min-height:62vh;display:grid;place-items:center;text-align:center}.nf>div{max-width:34em}.nf p{color:var(--ink60);margin:14px 0 28px;font-size:17px}.nf form{display:inline}`;

export function messagePage(o: { title: string; label: string; h1: string; text: string; action?: string; deleted?: string }) {
  const body = `${topbar()}
<main class="nf"${o.deleted ? ` data-deleted="${esc(o.deleted)}"` : ""}><div><span class="label">${esc(o.label)}</span><h1 style="margin-top:12px">${o.h1}</h1><p>${o.text}</p>${o.action ?? `<a class="btn" href="/">New paste</a>`}</div></main>`;
  return page(o.title, body, { css: NF_CSS });
}

export const notFoundPage = () =>
  messagePage({ title: "Not found · leaf.", label: "404", h1: "This paste is gone<em>.</em>", text: "It may have expired or been deleted, or the link is incomplete." });

export const deleteConfirmPage = (p: { id: string; title: string | null; key: string }) =>
  messagePage({
    title: "Delete paste · leaf.",
    label: "delete",
    h1: `Delete ${esc(p.title || "this paste")}<em>?</em>`,
    text: "The link stops working right away. This can't be undone.",
    action: `<form method="post" action="/d/${esc(p.id)}/${esc(p.key)}"><button class="btn" type="submit">Delete paste</button></form> <a class="btn ghost" href="/${esc(p.id)}">Keep it</a>`,
  });

export const deletedPage = (id: string) =>
  messagePage({ title: "Deleted · leaf.", label: "deleted", h1: "Deleted<em>.</em>", text: "The paste and its link are gone.", deleted: id });
