// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Browser build of leaf's language detection and highlighting (served as /assets/detect.js and loaded
 * on the first keystroke). It runs the same code as the server, so the editor shows what the paste will look like.
 */
import { detectLanguage, highlightLines, LANGUAGES } from "./highlight";

const g = globalThis as unknown as {
  leafDetect: (text: string) => { id: string; label: string };
  leafHighlight: (text: string, lang: string) => string;
};
g.leafDetect = (text) => {
  const id = detectLanguage(text);
  return { id, label: LANGUAGES[id] || id };
};
/** Highlighted HTML for the editor overlay, one line per source line (same limits as on the server). */
g.leafHighlight = (text, lang) => highlightLines(text, lang).join("\n");
