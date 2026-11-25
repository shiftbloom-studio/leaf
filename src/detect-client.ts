// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Browser build of leaf's language detection (served as /assets/detect.js, loaded on the first keystroke).
 * It runs the same code as the server, so what the picker shows is what the paste gets.
 */
import { detectLanguage, LANGUAGES } from "./highlight";

(globalThis as unknown as { leafDetect: (text: string) => { id: string; label: string } }).leafDetect = (text: string) => {
  const id = detectLanguage(text);
  return { id, label: LANGUAGES[id] || id };
};
