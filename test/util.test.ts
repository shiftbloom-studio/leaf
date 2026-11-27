// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { cleanContent, expirySeconds, ID_ALPHABET, ID_LENGTH, ID_RE, isNamedToken, lineCount, randomString, robotsTxt, sanitizeTitle, tokenUsable, trimTrailingSlashes } from "../src/util";

describe("ids", () => {
  it("are 12 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const id = randomString(ID_LENGTH);
      expect(id).toMatch(ID_RE);
      for (const ch of id) expect(ID_ALPHABET).toContain(ch);
    }
  });
});

describe("expiry", () => {
  const token = { owner: "t1", master: false };
  const master = { owner: "master", master: true };
  it("caps anonymous pastes at 12 hours", () => {
    expect(expirySeconds("12h", null)).toBe(43200);
    expect(expirySeconds("7d", null)).toBe(43200);
    expect(expirySeconds("never", null)).toBe(43200);
    expect(expirySeconds("10m", null)).toBe(600);
  });
  it("lets tokens keep pastes up to a year, and only the master token forever", () => {
    expect(expirySeconds("1y", token)).toBe(31536000);
    expect(expirySeconds("never", token)).toBe(604800);
    expect(expirySeconds("never", master)).toBeNull();
  });
});

describe("content", () => {
  it("normalises line endings and refuses empty or binary text", () => {
    expect(cleanContent("a\r\nb\rc")).toEqual({ ok: true, text: "a\nb\nc" });
    expect(cleanContent("  \n ").ok).toBe(false);
    expect(cleanContent("a\u0000b").ok).toBe(false);
  });
  it("counts lines like an editor", () => {
    expect(lineCount("a")).toBe(1);
    expect(lineCount("a\n")).toBe(1);
    expect(lineCount("a\nb")).toBe(2);
  });
  it("cleans titles", () => {
    expect(sanitizeTitle("  hello\n\tworld ")).toBe("hello world");
    expect(sanitizeTitle("x".repeat(300))).toHaveLength(120);
  });
});

describe("tokens", () => {
  it("recognises named tokens", () => {
    expect(isNamedToken("leaf_" + "a".repeat(30))).toBe(true);
    expect(isNamedToken("drop_" + "a".repeat(30))).toBe(false);
    expect(isNamedToken("leaf_short")).toBe(false);
  });
  it("rejects revoked and expired tokens", () => {
    expect(tokenUsable({ expires_at: null, revoked_at: null })).toBe(true);
    expect(tokenUsable({ expires_at: 10, revoked_at: null }, 20)).toBe(false);
    expect(tokenUsable({ expires_at: null, revoked_at: 5 })).toBe(false);
    expect(tokenUsable(null)).toBe(false);
  });
});

describe("robots.txt", () => {
  it("lets crawlers fetch the sitemap it advertises", () => {
    const txt = robotsTxt("https://leaf.example");
    expect(txt).toContain("Sitemap: https://leaf.example/sitemap.xml");
    expect(txt.indexOf("Allow: /sitemap.xml")).toBeLessThan(txt.indexOf("Disallow: /"));
  });
});

describe("trimTrailingSlashes", () => {
  it("drops only trailing slashes", () => {
    expect(trimTrailingSlashes("/abc/")).toBe("/abc");
    expect(trimTrailingSlashes("/abc///")).toBe("/abc");
    expect(trimTrailingSlashes("/a/b")).toBe("/a/b");
    expect(trimTrailingSlashes("///")).toBe("");
    expect(trimTrailingSlashes("")).toBe("");
  });
  it("stays fast on long runs of slashes", () => {
    const s = "/".repeat(100_000) + "a";
    const t = performance.now();
    expect(trimTrailingSlashes(s)).toBe(s);
    expect(performance.now() - t).toBeLessThan(50);
  });
});
