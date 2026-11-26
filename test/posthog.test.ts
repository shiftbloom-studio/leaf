/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { phAi, phCapture, phException, phKey, phProxy, phScriptTag, scrubText, sizeBucket } from "../src/posthog";
import { legalPage } from "../src/legal";
import { configureUi, homePage, notFoundPage, viewPage } from "../src/html";
import { brandFrom } from "../src/brand";

const KEY = "phc_testtoken1234567890";
const env = { POSTHOG_KEY: KEY };
const KEEP = /^\/(privacy|imprint)?$/;

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("ok", { headers: { "set-cookie": "ph=1", "content-type": "text/plain" } });
  }));
  return calls;
}

describe("posthog config", () => {
  it("is off without a valid project token", () => {
    expect(phKey({})).toBeNull();
    expect(phKey({ POSTHOG_KEY: "phx_personal_key_000000" })).toBeNull();
    expect(phKey(env)).toBe(KEY);
    expect(phScriptTag({})).toBe("");
    expect(phScriptTag(env)).toBe('<script src="/_sb/init.js" defer></script>');
  });
  it("sends nothing when off", async () => {
    const calls = stubFetch();
    await phCapture({}, null, "x");
    await phException({}, null, new Error("boom"));
    expect(await phAi({}, null, { model: "m" }, async () => 7)).toBe(7);
    expect(calls).toHaveLength(0);
  });
});

describe("proxy", () => {
  const req = (path: string, init: RequestInit = {}) => new Request(`https://grow.test${path}`, init);

  it("ignores other paths and answers 404 while off", async () => {
    expect(await phProxy(req("/abc"), env)).toBeNull();
    expect(await phProxy(req("/_sbx"), env)).toBeNull();
    expect((await phProxy(req("/_sb/e/"), {}))!.status).toBe(404);
  });
  it("routes static files to the assets host and the rest to the API host", async () => {
    const calls = stubFetch();
    await phProxy(req("/_sb/static/array.js?v=1"), env);
    await phProxy(req("/_sb/i/v0/e/?ip=0", { method: "POST", body: "{}" }), env);
    expect(calls[0].url).toBe("https://us-assets.i.posthog.com/static/array.js?v=1");
    expect(calls[1].url).toBe("https://us.i.posthog.com/i/v0/e/?ip=0");
    expect(calls[1].init.method).toBe("POST");
  });
  it("follows POSTHOG_HOST", async () => {
    const calls = stubFetch();
    await phProxy(req("/_sb/static/x.js"), { ...env, POSTHOG_HOST: "https://eu.i.posthog.com/" });
    expect(calls[0].url).toBe("https://eu-assets.i.posthog.com/static/x.js");
  });
  it("never forwards cookies or the app's own bearer token, but passes the client IP", async () => {
    const calls = stubFetch();
    const res = await phProxy(req("/_sb/flags/", { method: "POST", body: "{}", headers: { cookie: "a=b", authorization: "Bearer drop_secret_token", "cf-connecting-ip": "203.0.113.9" } }), env);
    const h = new Headers(calls[0].init.headers);
    expect(h.get("cookie")).toBeNull();
    expect(h.get("authorization")).toBeNull();
    expect(h.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(res!.headers.get("set-cookie")).toBeNull();
    await phProxy(req("/_sb/i/v1/e", { method: "POST", body: "{}", headers: { authorization: `Bearer ${KEY}` } }), env);
    expect(new Headers(calls[1].init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
  });
});

describe("init.js", () => {
  async function load(path: string) {
    const res = await phProxy(new Request("https://grow.test/_sb/init.js"), env, { app: "grow", keep: KEEP, secret: /grow_[A-Za-z0-9]{16,}|\/o\/[A-Za-z0-9]{24}|#welcome=[^\s"&]*/ });
    const code = await res!.text();
    let cfg: any = null;
    const script = { parentNode: { insertBefore() {} } };
    const win: any = {};
    win.window = win;
    win.document = { createElement: () => ({}), getElementsByTagName: () => [script] };
    win.location = { origin: "https://grow.test", pathname: path };
    win.URL = URL;
    runInNewContext(code, win);
    // the stub queued the init call: [token, config, name]
    cfg = win.posthog._i[0][1];
    return { token: win.posthog._i[0][0], cfg };
  }
  it("loads cookieless, without replay, through the proxy", async () => {
    const { token, cfg } = await load("/");
    expect(token).toBe(KEY);
    expect(cfg.api_host).toBe("/_sb");
    expect(cfg.cookieless_mode).toBe("always");
    expect(cfg.disable_session_recording).toBe(true);
    expect(cfg.autocapture.element_allowlist).toEqual(["a", "button"]);
  });
  it("masks item paths, query strings and link targets before sending", async () => {
    const { cfg } = await load("/");
    const ev = cfg.before_send({
      event: "$pageview",
      properties: {
        $current_url: "https://grow.test/aB3dE?x=1#y",
        $pathname: "/aB3dE",
        $referrer: "https://other.example/some/path?q=secret",
        $elements_chain: 'a.copy:attr__href="https://grow.test/aB3dE"attr__aria-label="Delete x.png"attr__id="cp"nth-child="1"',
        $set: { email: "x" },
      },
    });
    expect(ev.properties.$current_url).toBe("https://grow.test/[private]");
    expect(ev.properties.$pathname).toBe("/[private]");
    expect(ev.properties.$referrer).toBe("https://other.example");
    expect(ev.properties.$elements_chain).toBe('a.copy:attr__id="cp"nth-child="1"');
    expect(ev.properties.$set).toBeUndefined();
    expect(ev.properties.app).toBe("grow");
    const kept = cfg.before_send({ event: "$pageview", properties: { $current_url: "https://grow.test/privacy?utm=1" } });
    expect(kept.properties.$current_url).toBe("https://grow.test/privacy");
    expect(cfg.before_send({ event: "x", properties: { $referrer: "$direct" } }).properties.$referrer).toBe("$direct");
  });
  it("never sends the #welcome key, overlay keys or element labels", async () => {
    const { cfg } = await load("/app");
    expect(cfg.disable_capture_url_hashes).toBe(true);
    const key = "grow_" + "a".repeat(36);
    const overlay = "/o/" + "B".repeat(24);
    const ev = cfg.before_send({
      event: "$$heatmap",
      properties: {
        $heatmap_data: { [`https://grow.test/app#welcome=${key}`]: [{ x: 1 }], "https://grow.test/app": [{ x: 2 }] },
        $elements: [{ tag_name: "button", attr__aria_label: "Finish buy milk" }],
        $elements_chain: 'button.ib:attr__aria-label="Finish \\"milk\\" now"attr__title="x"nth-child="1"',
        $exception_list: [{ value: `failed for ${key} at ${overlay}`, stacktrace: { frames: [{ filename: `https://grow.test/app#welcome=${key}` }] } }],
      },
    });
    const out = JSON.stringify(ev.properties);
    expect(out).not.toContain(key);
    expect(out).not.toContain("B".repeat(24));
    expect(out).not.toContain("milk");
    expect(ev.properties.$elements).toEqual([{ tag_name: "button" }]);
    expect(ev.properties.$elements_chain).toBe('button.ib:nth-child="1"');
    expect(ev.properties.$heatmap_data["https://grow.test/[private]"]).toEqual([{ x: 1 }, { x: 2 }]);
  });
});

describe("worker events", () => {
  it("sends server events without person profile or IP", async () => {
    const calls = stubFetch();
    await phCapture(env, null, "item_created", { kind: "file" });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://us.i.posthog.com/batch/");
    expect(body.api_key).toBe(KEY);
    expect(body.batch[0].properties).toMatchObject({ kind: "file", $process_person_profile: false, $geoip_disable: true });
  });
  it("masks long strings in exceptions", async () => {
    const calls = stubFetch();
    await phException(env, null, new Error("token drop_abcdefghijklmnopqrstuv failed"));
    const ex = JSON.parse(String(calls[0].init.body)).batch[0];
    expect(ex.event).toBe("$exception");
    expect(ex.properties.$exception_list[0].value).toBe("token [masked] failed");
  });
  it("reports AI calls without inputs or outputs", async () => {
    const calls = stubFetch();
    await expect(phAi(env, null, { model: "@cf/x" }, async () => ({ caption: "a cat", usage: { prompt_tokens: 3, completion_tokens: 2 } }))).resolves.toMatchObject({ caption: "a cat" });
    const p = JSON.parse(String(calls[0].init.body)).batch[0].properties;
    expect(p).toMatchObject({ $ai_model: "@cf/x", $ai_input_tokens: 3, $ai_output_tokens: 2 });
    expect(JSON.stringify(p)).not.toContain("a cat");
    await expect(phAi(env, null, { model: "@cf/x" }, async () => { throw new Error("down"); })).rejects.toThrow("down");
    expect(JSON.parse(String(calls[1].init.body)).batch[0].properties.$ai_is_error).toBe(true);
  });
  it("helpers", () => {
    expect(scrubText("x".repeat(600)).length).toBeLessThanOrEqual(500);
    expect(sizeBucket(500_000)).toBe("<1MB");
  });
});

describe("privacy policy", () => {
  const legal = { name: "Jane Doe", street: "Example St 1", city: "12345 Town", country: { en: "Germany", de: "Deutschland" }, email: "jane@example.com", authority: "DPA" };
  it("names PostHog only when analytics is on", () => {
    const off = legalPage("privacy", legal, { abuseEmail: null, turnstile: false });
    expect(off).not.toContain("Usage statistics");
    expect(off).toContain("no analysis of visitors");
    const on = legalPage("privacy", legal, { abuseEmail: null, turnstile: false, analytics: true });
    expect(on).toContain("<h2>Usage statistics</h2>");
    expect(on).toContain("Data Privacy Framework");
    expect(on).not.toContain("no analysis of visitors");
    expect(legalPage("datenschutz", legal, { abuseEmail: null, turnstile: false, analytics: true })).toContain("<h2>Nutzungsstatistik</h2>");
  });
});

describe("leaf pages", () => {
  const tag = phScriptTag(env);
  it("load the script only on the start page and not found", () => {
    configureUi({ legal: true, abuseEmail: null, brand: brandFrom(), analytics: tag });
    expect(homePage({ limits: { anonBytes: 1024, tokenBytes: 2048 }, siteKey: null })).toContain(tag);
    expect(notFoundPage()).toContain(tag);
    const view = viewPage({ id: "aB3dE9xY", title: null, lang: "text", size: 3, lines: 1, created_at: 0, expires_at: null, burn: 0 } as any, ["abc"], { url: "https://leaf.test/aB3dE9xY" });
    expect(view).not.toContain("/_sb/");
  });
});
