// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Who runs this instance and where its source lives. Everything here comes from Worker vars,
 * so a self-hosted copy never shows someone else's name.
 *
 * - SOURCE_URL: the code users are offered under AGPL section 13. Point it at your fork.
 * - OPERATOR_NAME, OPERATOR_URL, OPERATOR_PLACE: shown in the footer.
 * - BRAND=shiftbloom: the upstream preset (shiftbloom studio wordmark), used by leaf.shiftbloom.studio.
 */
export type Brand = {
  sourceUrl: string;
  operator: { name: string; url: string | null; place: string | null } | null;
  /** Render the shiftbloom studio wordmark instead of the operator's name as text. */
  studioWordmark: boolean;
  siteTitle: string;
  description: string;
};

export const UPSTREAM_SOURCE = "https://github.com/shiftbloom-studio/leaf";

export type BrandEnv = { BRAND?: string; SOURCE_URL?: string; OPERATOR_NAME?: string; OPERATOR_URL?: string; OPERATOR_PLACE?: string };

const httpUrl = (v: string | undefined) => (v && /^https?:\/\/[^\s"'<>]+$/.test(v.trim()) ? v.trim() : null);
const text = (v: string | undefined, max = 80) => (v && v.trim() ? v.trim().slice(0, max) : null);

const DESCRIPTION = "Paste code or logs and share the link. Highlighting for 30 languages, and anonymous pastes are deleted after 12 hours at the latest.";

export function brandFrom(env: BrandEnv = {}): Brand {
  const sourceUrl = httpUrl(env.SOURCE_URL) ?? UPSTREAM_SOURCE;
  if (env.BRAND === "shiftbloom") {
    return {
      sourceUrl,
      operator: { name: "shiftbloom studio", url: "https://shiftbloom.studio", place: "hamburg" },
      studioWordmark: true,
      siteTitle: "leaf. · shiftbloom studio",
      description: DESCRIPTION,
    };
  }
  const name = text(env.OPERATOR_NAME);
  return {
    sourceUrl,
    operator: name ? { name, url: httpUrl(env.OPERATOR_URL), place: text(env.OPERATOR_PLACE, 40) } : null,
    studioWordmark: false,
    siteTitle: name ? `leaf. · ${name}` : "leaf.",
    description: DESCRIPTION,
  };
}
