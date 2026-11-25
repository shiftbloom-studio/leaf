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

describe("pathological input", () => {
  const time = (f: () => unknown) => { const s = performance.now(); f(); return performance.now() - s; };
  it("leaves very long lines plain instead of spending seconds on them", () => {
    const line = "a".repeat(40 * 1024);
    let lines: string[] = [];
    expect(time(() => (lines = highlightLines(line, "java")))).toBeLessThan(500);
    expect(lines).toEqual([line]);
  });
  it("stays fast on a 256 KB paste of long words in a slow grammar", () => {
    const text = ("a".repeat(500) + "\n").repeat(500);
    expect(time(() => highlightLines(text, "cpp"))).toBeLessThan(500);
  });
  it("detects quickly on a huge single line", () => {
    expect(time(() => detectLanguage("a".repeat(256 * 1024)))).toBeLessThan(500);
  });
  it("still highlights normal lines around a long one", () => {
    const out = highlightLines(`const a = 1;\n${"x".repeat(2000)}\nconst b = 2;`, "javascript");
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("hljs-keyword");
    expect(out[1]).not.toContain("<span");
    expect(out[2]).toContain("hljs-keyword");
  });
});

describe("detection of short snippets", () => {
  const s: [string,string][] = [
   ["python","def add(a, b):\n    return a + b\n"], ["python","class Foo:\n    def __init__(self):\n        self.x = 1\n"], ["python","if x > 1:\n    print(x)\nelif x < 0:\n    pass\n"],
   ["python","for i in range(10):\n    print(i)\n"], ["python","from flask import Flask\napp = Flask(__name__)\n"], ["python","with open('f.txt') as f:\n    data = f.read()\n"],
   ["python","try:\n    x = 1/0\nexcept ZeroDivisionError as e:\n    print(e)\n"], ["javascript","const a = 1;\nconsole.log(a);\n"], ["typescript","interface User {\n  name: string;\n}\n"],
   ["json",'{"a": 1, "b": [1,2]}'], ["bash","#!/bin/bash\necho hi\n"], ["go","package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hi\")\n}\n"],
   ["sql","SELECT * FROM users WHERE id = 1;"], ["rust","fn main() {\n    let mut x = 5;\n    println!(\"{}\", x);\n}\n"], ["css",".a {\n  color: red;\n  margin: 0 auto;\n}\n.b > .c {\n  display: flex;\n}\n"],
   ["cpp","#include <iostream>\nint main() {\n  std::cout << 1;\n}\n"], ["dockerfile","FROM node:26\nWORKDIR /app\nRUN npm ci\n"], ["diff","diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n"],
   ["kotlin","package com.example\n\nimport kotlin.math.max\n\nfun main() {}\n"], ["java","package com.example;\n\nimport java.util.List;\n"],
   ["plaintext","hello there, this is just a note"], ["yaml","name: CI\non:\n  push:\n    branches: [main]\njobs:\n  build:\n    runs-on: ubuntu-latest\n"],
  ];
  it.each(s)("recognises %s", (want, text) => {
    expect(detectLanguage(text)).toBe(want);
  });
});
