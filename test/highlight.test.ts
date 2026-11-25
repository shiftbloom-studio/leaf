import { describe, expect, it } from "vitest";
import { detectLanguage, highlightLines, normalizeLang, splitLines } from "../src/highlight";

describe("languages", () => {
  it("accepts ids, aliases and auto", () => {
    expect(normalizeLang("TypeScript")).toBe("typescript");
    expect(normalizeLang("ts")).toBe("typescript");
    expect(normalizeLang("")).toBe("auto");
    expect(normalizeLang("brainfuck")).toBeNull();
  });
  it("detects common languages and falls back to plain text", () => {
    expect(detectLanguage('{\n  "name": "leaf",\n  "version": "0.1.0",\n  "private": true\n}\n')).toBe("json");
    expect(detectLanguage("def add(a, b):\n    return a + b\n\nimport os\nprint(os.getcwd())\n")).toBe("python");
    expect(detectLanguage("hello there")).toBe("plaintext");
  });
});

describe("highlighting", () => {
  it("escapes plain text", () => {
    expect(highlightLines("<script>alert(1)</script>\n", "plaintext")).toEqual(["&lt;script&gt;alert(1)&lt;/script&gt;"]);
  });
  it("never lets markup through in highlighted code", () => {
    const out = highlightLines('const x = "<img src=x onerror=alert(1)>";', "javascript").join("\n");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
  it("keeps spans balanced on every line", () => {
    const lines = highlightLines("/* one\ntwo\nthree */\nlet a = 1;", "javascript");
    expect(lines).toHaveLength(4);
    for (const l of lines) expect((l.match(/<span/g) || []).length).toBe((l.match(/<\/span>/g) || []).length);
    expect(lines[1]).toContain("hljs-comment");
  });
  it("splits nested spans", () => {
    expect(splitLines('<span class="a">x<span class="b">y\nz</span></span>')).toEqual(['<span class="a">x<span class="b">y</span></span>', '<span class="a"><span class="b">z</span></span>']);
  });
});
