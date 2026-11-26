// SPDX-License-Identifier: AGPL-3.0-or-later
/** Imprint and privacy policy in English and German. Operator details come from the LEGAL var; nothing personal is hardcoded. */
import { esc, footer, head, topbar, ui } from "./html";

export type LegalInfo = { name: string; business?: string; street: string; city: string; country: { en: string; de: string }; email: string; phone?: string; vatId?: string; authority: string };
export type LegalKind = "privacy" | "datenschutz" | "imprint" | "impressum";
export const LEGAL_PATHS: Record<string, LegalKind> = { "/privacy": "privacy", "/datenschutz": "datenschutz", "/imprint": "imprint", "/impressum": "impressum" };
const UPDATED = { en: "Last updated 26 November 2026", de: "Stand: 26. November 2026" };

/** LEGAL is a JSON string var; anything incomplete hides the legal pages instead of rendering half an imprint. */
export function parseLegal(raw: string | undefined): LegalInfo | null {
  if (!raw) return null;
  try {
    const l = JSON.parse(raw) as LegalInfo;
    if (!l.name || !l.street || !l.city || !l.email || !l.authority || !l.country?.en || !l.country?.de) return null;
    return l;
  } catch {
    return null;
  }
}

/** analytics: PostHog is on, so the privacy policy describes it. */
type Opts = { abuseEmail: string | null; turnstile: boolean; analytics?: boolean };

const CSS = `.legal{max-width:44em;padding:clamp(28px,5vw,56px) 0 0}
.legal h1{font-size:clamp(32px,4.6vw,48px)}
.legal h2{font-size:22px;margin:36px 0 10px}
.legal p,.legal address{margin:0 0 14px;font-style:normal}
.legal .meta{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0 28px;font-size:14px;color:var(--ink60)}`;

export function legalPage(kind: LegalKind, l: LegalInfo, o: Opts) {
  const de = kind === "datenschutz" || kind === "impressum";
  const lang = de ? "de" : "en";
  const isPrivacy = kind === "privacy" || kind === "datenschutz";
  const title = { privacy: "Privacy policy", datenschutz: "Datenschutzerklärung", imprint: "Imprint", impressum: "Impressum" }[kind];
  const other = { privacy: "/datenschutz", datenschutz: "/privacy", imprint: "/impressum", impressum: "/imprint" }[kind];
  const mail = `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`;
  const address = `<address>${esc(l.name)}<br>${l.business ? `${esc(l.business)}<br>` : ""}${esc(l.street)}<br>${esc(l.city)}<br>${esc(l.country[lang])}</address>`;
  const body = isPrivacy ? (de ? privacyDe(address, mail, l, o) : privacyEn(address, mail, l, o)) : imprint(de, address, mail, l, o);
  return `${head(`${title} · leaf.`, { css: CSS, lang, index: true, extraHead: o.analytics ? ui().analytics || "" : "" })}<body><div class="wrap">${topbar()}
<main class="legal"><span class="label">${de ? "leaf. Rechtliches" : "leaf. legal"}</span><h1 style="margin-top:12px">${title}</h1>
<div class="meta">${isPrivacy ? `<span>${UPDATED[lang]}</span>` : ""}<a href="${other}" hreflang="${de ? "en" : "de"}">${de ? "English" : "Deutsch"}</a></div>
${body}
</main>
${footer(lang)}
</div></body></html>`;
}

function imprint(de: boolean, address: string, mail: string, l: LegalInfo, o: Opts) {
  const phone = l.phone ? `<br>${de ? "Telefon" : "Phone"}: <a href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">${esc(l.phone)}</a>` : "";
  const vat = l.vatId ? `<p>${de ? "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG" : "VAT ID pursuant to § 27a UStG"}: ${esc(l.vatId)}</p>` : "";
  const report = o.abuseEmail ? `<a href="mailto:${esc(o.abuseEmail)}">${esc(o.abuseEmail)}</a>` : mail;
  return de
    ? `<p>Angaben gemäß § 5 DDG:</p>${address}<p>E-Mail: ${mail}${phone}</p>${vat}
<h2>Verbraucherstreitbeilegung</h2><p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
<h2>Inhalte von Nutzern</h2><p>Texte auf leaf stammen von den Personen, die sie eingefügt haben, nicht von uns. Wenn dir ein Text auffällt, der gegen das Recht verstößt, schick uns den Link an ${report} oder nutze „Report this paste“ auf seiner Seite. Wir prüfen jeden Hinweis und entfernen rechtswidrige Inhalte umgehend.</p>`
    : `<p>Information pursuant to § 5 DDG:</p>${address}<p>Email: ${mail}${phone}</p>${vat}
<h2>Consumer dispute resolution</h2><p>We are not willing or obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>
<h2>Content posted by users</h2><p>Texts on leaf come from the people who pasted them, not from us. If you come across one that breaks the law, send the link to ${report} or use "Report this paste" on its page. We look into every report and remove unlawful content without delay.</p>`;
}

const USAGE_EN = `<h2>Usage statistics</h2>
<p>To see how leaf is used and where it breaks, the start page, the legal pages and the "not found" page load a script that we deliver from leaf itself (posthog-js, under /_sb/) and that reports to PostHog: which of these pages was viewed and the site you came from (its domain only), clicks on buttons and links (without their text or link targets), how fast the page loaded, and errors in the page's code. What you type into the editor is never recorded. Paste pages, raw text, delete links and the API don't load it, and addresses of pastes are never sent. Our Worker also reports, without your IP address, when a paste was created, refused or deleted (a rough size class such as "under 10 KB", the language, how long it stays, whether it is read once, and whether it came from the website or the API with or without a token), how many pastes the hourly cleanup removed, and errors in the Worker. Contents, titles, IDs, tokens and delete links are never sent.</p>
<p>The script sets no cookies and stores nothing on your device. PostHog derives a daily changing ID from your IP address and browser details on its servers, so visits on the same day can be counted together, but not across days. PostHog also uses the IP address to derive an approximate location (country and city). There is no session recording. PostHog may show a short survey on these pages; you only send something there if you choose to.</p>
<p>PostHog Inc., 2261 Market St. #4008, San Francisco, CA 94114, USA, stores this data for us on servers in the USA and processes it as our processor under a data processing agreement (Art. 28 GDPR). PostHog is certified under the EU-U.S. Data Privacy Framework, for which the European Commission has adopted an adequacy decision (Art. 45 GDPR); the agreement also contains the EU standard contractual clauses. We delete the statistics after 12 months at the latest. The legal basis is our legitimate interest in improving leaf and fixing errors (Art. 6(1)(f) GDPR). A content blocker or your browser's tracking protection may stop the script; leaf works the same without it. More in <a href="https://posthog.com/privacy" rel="noopener">PostHog's privacy policy</a>.</p>
`;
const USAGE_DE = `<h2>Nutzungsstatistik</h2>
<p>Damit wir sehen, wie leaf genutzt wird und wo es hakt, laden die Startseite, die Rechtsseiten und die Seite „nicht gefunden“ ein Skript, das wir von leaf selbst ausliefern (posthog-js, unter /_sb/) und das an PostHog meldet: welche dieser Seiten aufgerufen wurde und von welcher Website du kommst (nur deren Domain), Klicks auf Schaltflächen und Links (ohne deren Text oder Linkziel), wie schnell die Seite geladen hat und Fehler im Code der Seite. Was du in den Editor tippst, wird nie erfasst. Paste-Seiten, Rohtext, Löschlinks und die API laden es nicht, und Adressen von Pastes werden nie gesendet. Unser Worker meldet außerdem, ohne deine IP-Adresse, wenn ein Paste angelegt, abgelehnt oder gelöscht wurde (eine grobe Größenklasse wie „unter 10 KB“, die Sprache, wie lange er bleibt, ob er nur einmal lesbar ist und ob er über die Website oder die API, mit oder ohne Token kam), wie viele Pastes die stündliche Bereinigung entfernt hat, und Fehler im Worker. Inhalte, Titel, IDs, Tokens und Löschlinks werden nie gesendet.</p>
<p>Das Skript setzt keine Cookies und speichert nichts auf deinem Gerät. PostHog bildet auf seinen Servern aus deiner IP-Adresse und Angaben deines Browsers eine täglich wechselnde ID, sodass Besuche am selben Tag zusammen gezählt werden können, aber nicht über Tage hinweg. Außerdem leitet PostHog aus der IP-Adresse einen ungefähren Standort ab (Land und Stadt). Es gibt keine Sitzungsaufzeichnung. PostHog kann auf diesen Seiten eine kurze Umfrage zeigen; dort sendest du nur etwas, wenn du es selbst möchtest.</p>
<p>PostHog Inc., 2261 Market St. #4008, San Francisco, CA 94114, USA, speichert diese Daten für uns auf Servern in den USA und verarbeitet sie als unser Auftragsverarbeiter auf Grundlage eines Auftragsverarbeitungsvertrags (Art. 28 DSGVO). PostHog ist nach dem EU-US Data Privacy Framework zertifiziert, für das die Europäische Kommission einen Angemessenheitsbeschluss erlassen hat (Art. 45 DSGVO); der Vertrag enthält zusätzlich die EU-Standardvertragsklauseln. Wir löschen die Statistik spätestens nach 12 Monaten. Rechtsgrundlage ist unser berechtigtes Interesse, leaf zu verbessern und Fehler zu beheben (Art. 6 Abs. 1 lit. f DSGVO). Ein Inhaltsblocker oder der Tracking-Schutz deines Browsers kann das Skript aufhalten; leaf funktioniert ohne es genauso. Mehr dazu in der <a href="https://posthog.com/privacy" rel="noopener">Datenschutzerklärung von PostHog</a>.</p>
`;

function privacyEn(address: string, mail: string, l: LegalInfo, o: Opts) {
  return `<p>leaf has no user accounts and sets no cookies. ${o.analytics ? `There is no advertising, no profiling and no automated decision-making about you. We do count, without cookies and without knowing who you are, how leaf is used, as described under "Usage statistics".` : "There is no tracking or advertising, no analysis of visitors or their behavior, and no automated decision-making about you."} This policy covers the personal data that is processed nonetheless when you open leaf or a paste, above all your IP address, and what happens to the texts you paste.</p>
<h2>Controller</h2>${address}<p>Email: ${mail}</p>
<h2>Hosting</h2>
<p>Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA, runs leaf on our behalf: the pages, the pastes and the program behind them (a Cloudflare Worker). To do so, Cloudflare processes your IP address, the address of the page you request, the time, and details your browser sends, such as its user agent. You don't have to provide this data, but without it nothing can be shown to you.</p>
<p>Requests that our Worker handles are also logged, including the IP address, the approximate location Cloudflare derives from it, and the address requested. We use these logs only to fix errors and to prevent abuse, and they are deleted after at most 7 days.</p>
<p>To prevent abuse, the Worker counts new pastes, failed token attempts and requests for pastes that don't exist, per IP address over one minute, and refuses requests above a limit. The count is held only in the memory of Cloudflare's rate limiter and is not stored with any paste.</p>
<p>Fonts are fetched by our Worker and delivered from leaf itself, so your browser doesn't contact Fontshare or jsDelivr.</p>
<p>The legal basis is our legitimate interest in running leaf securely and reliably (Art. 6(1)(f) GDPR). Cloudflare processes the data as our processor under a data processing agreement (Art. 28 GDPR). Cloudflare, Inc. is certified under the EU-U.S. Data Privacy Framework, for which the European Commission has adopted an adequacy decision (Art. 45 GDPR); the agreement also contains the EU standard contractual clauses. More in <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a>.</p>
${o.analytics ? USAGE_EN : ""}<h2>Pastes</h2>
<p>Anyone can create a paste. Anyone who has its link can read it; there is no public list and no search. We store the text in Cloudflare R2 and these details in Cloudflare D1: title, language, size, number of lines, creation time, expiry time, a checksum of the delete link, whether it is read once, how often it was opened and, for pastes made with a token, which token made it. We don't store your IP address or any other detail about you with a paste.</p>
<p>A paste is deleted when its expiry time is reached (at most 12 hours after it was made without a token, checked every hour), when it is read once and was set to that, or when someone deletes it with its delete link or token. If a paste concerns you and you want it removed, email us${o.abuseEmail ? ` or use "Report this paste" on its page` : ""}. The legal basis for storing and showing pastes is our legitimate interest in letting people share texts by link (Art. 6(1)(f) GDPR).</p>
${o.turnstile ? `<h2>Bot protection</h2>
<p>New pastes without a token are protected by Cloudflare Turnstile, which checks whether a person or a program is filling in the form. For this, your browser loads a script from challenges.cloudflare.com on the start page, and Cloudflare processes technical data about your browser and device. The legal basis is our legitimate interest in protecting leaf from automated abuse (Art. 6(1)(f) GDPR); data Turnstile stores in your browser is strictly necessary for the check you start (§ 25(2) no. 2 TDDDG). More in <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Cloudflare's Turnstile privacy addendum</a>.</p>
` : ""}<h2>Your browser</h2>
<p>After you create a paste without a token, your browser keeps its link and delete link in its local storage under the name "leaf_pastes", so the start page can list them for you. If you enter a token, it is kept there as "leaf_token". Neither is a cookie, neither is sent to us unless you use it, and both stay only on your device; expired pastes are removed from the list, and "Forget it" removes the token. Storing them is strictly necessary for the function you asked for (§ 25(2) no. 2 TDDDG).</p>
<h2>Email</h2>
<p>If you email us, we use your address and message only to reply (Art. 6(1)(f) GDPR) and delete them once the matter is settled, unless the law requires us to keep them.</p>
<h2>Your rights</h2>
<p>You have the right of access to your personal data (Art. 15 GDPR), to rectification (Art. 16), to erasure (Art. 17), to restriction of processing (Art. 18) and to data portability (Art. 20). To exercise them, email us. You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), for example the one where you live or the one responsible for us: ${esc(l.authority)}.</p>
<h2>Right to object</h2>
<p><strong>You may object at any time, on grounds relating to your particular situation, to the processing of your personal data based on Art. 6(1)(f) GDPR (Art. 21 GDPR).</strong></p>`;
}

function privacyDe(address: string, mail: string, l: LegalInfo, o: Opts) {
  return `<p>leaf hat keine Benutzerkonten und setzt keine Cookies. ${o.analytics ? "Es verwendet keine Werbedienste, erstellt keine Profile und trifft keine automatisierten Entscheidungen über dich. Wie leaf genutzt wird, zählen wir ohne Cookies und ohne zu wissen, wer du bist, wie unter „Nutzungsstatistik“ beschrieben." : "Es verwendet keine Tracking- oder Werbedienste, wertet weder Besucher noch ihr Verhalten aus und trifft keine automatisierten Entscheidungen über dich."} Diese Erklärung beschreibt, welche personenbezogenen Daten trotzdem verarbeitet werden, wenn du leaf oder einen Paste öffnest, vor allem deine IP-Adresse, und was mit den Texten geschieht, die du einfügst.</p>
<h2>Verantwortlicher</h2>${address}<p>E-Mail: ${mail}</p>
<h2>Hosting</h2>
<p>Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA, betreibt leaf in unserem Auftrag: die Seiten, die Pastes und das Programm dahinter (einen Cloudflare Worker). Dazu verarbeitet Cloudflare deine IP-Adresse, die Adresse der aufgerufenen Seite, den Zeitpunkt und Angaben, die dein Browser mitsendet, etwa den User-Agent. Du musst diese Daten nicht bereitstellen, ohne sie kann dir aber nichts angezeigt werden.</p>
<p>Anfragen, die unser Worker bearbeitet, werden zusätzlich protokolliert, samt IP-Adresse, dem ungefähren Standort, den Cloudflare daraus ableitet, und der aufgerufenen Adresse. Wir nutzen diese Protokolle nur, um Fehler zu beheben und Missbrauch zu verhindern; sie werden nach spätestens 7 Tagen gelöscht.</p>
<p>Um Missbrauch zu verhindern, zählt der Worker neue Pastes, fehlgeschlagene Token-Versuche und Aufrufe von Pastes, die es nicht gibt, je IP-Adresse über eine Minute und weist Anfragen oberhalb einer Grenze ab. Die Zählung liegt nur im Arbeitsspeicher von Cloudflares Rate-Limiter und wird nicht mit einem Paste gespeichert.</p>
<p>Schriften lädt unser Worker selbst und liefert sie von leaf aus, dein Browser verbindet sich also nicht mit Fontshare oder jsDelivr.</p>
<p>Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und zuverlässigen Betrieb von leaf (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare verarbeitet die Daten als unser Auftragsverarbeiter auf Grundlage eines Auftragsverarbeitungsvertrags (Art. 28 DSGVO). Cloudflare, Inc. ist nach dem EU-U.S. Data Privacy Framework zertifiziert, für das ein Angemessenheitsbeschluss der Europäischen Kommission besteht (Art. 45 DSGVO); der Vertrag enthält zusätzlich die EU-Standardvertragsklauseln. Mehr dazu in der <a href="https://www.cloudflare.com/de-de/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.</p>
${o.analytics ? USAGE_DE : ""}<h2>Pastes</h2>
<p>Pastes kann jeder anlegen. Wer den Link zu einem Paste hat, kann ihn lesen; eine öffentliche Liste oder Suche gibt es nicht. Wir speichern den Text in Cloudflare R2 und diese Angaben in Cloudflare D1: Titel, Sprache, Größe, Zeilenzahl, Zeitpunkt der Erstellung, Ablaufzeitpunkt, eine Prüfsumme des Löschlinks, ob er nur einmal lesbar ist, wie oft er aufgerufen wurde und, bei Pastes mit Token, welcher Token ihn angelegt hat. Deine IP-Adresse oder andere Angaben über dich speichern wir nicht mit einem Paste.</p>
<p>Ein Paste wird gelöscht, wenn sein Ablaufzeitpunkt erreicht ist (ohne Token spätestens 12 Stunden nach dem Anlegen, stündlich geprüft), wenn er auf einmaliges Lesen gestellt war und geöffnet wurde, oder wenn jemand ihn mit seinem Löschlink oder Token löscht. Wenn ein Paste dich betrifft und du ihn entfernt haben möchtest, schreib uns${o.abuseEmail ? `, etwa über „Report this paste“ auf seiner Seite` : ""}. Rechtsgrundlage für das Speichern und Anzeigen ist unser berechtigtes Interesse, Texte per Link teilen zu lassen (Art. 6 Abs. 1 lit. f DSGVO).</p>
${o.turnstile ? `<h2>Schutz vor Bots</h2>
<p>Neue Pastes ohne Token sind durch Cloudflare Turnstile geschützt, das prüft, ob ein Mensch oder ein Programm das Formular ausfüllt. Dazu lädt dein Browser auf der Startseite ein Skript von challenges.cloudflare.com, und Cloudflare verarbeitet technische Daten über deinen Browser und dein Gerät. Rechtsgrundlage ist unser berechtigtes Interesse, leaf vor automatisiertem Missbrauch zu schützen (Art. 6 Abs. 1 lit. f DSGVO); was Turnstile dafür in deinem Browser speichert, ist für die von dir gestartete Prüfung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Mehr dazu im <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Turnstile-Datenschutzhinweis von Cloudflare</a>.</p>
` : ""}<h2>Dein Browser</h2>
<p>Nachdem du ohne Token einen Paste angelegt hast, speichert dein Browser dessen Link und Löschlink in seinem lokalen Speicher unter dem Namen „leaf_pastes“, damit die Startseite sie dir auflisten kann. Wenn du einen Token eingibst, liegt er dort als „leaf_token“. Beides ist kein Cookie, wird nur an uns gesendet, wenn du es benutzt, und bleibt auf deinem Gerät; abgelaufene Pastes verschwinden aus der Liste, und „Forget it“ entfernt den Token. Das Speichern ist für die von dir gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).</p>
<h2>E-Mail</h2>
<p>Wenn du uns schreibst, nutzen wir deine Adresse und Nachricht nur, um dir zu antworten (Art. 6 Abs. 1 lit. f DSGVO), und löschen sie, sobald die Sache erledigt ist, es sei denn, das Gesetz verpflichtet uns zur Aufbewahrung.</p>
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft über deine personenbezogenen Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Schreib uns dazu eine E-Mail. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), etwa bei der an deinem Wohnort oder bei der für uns zuständigen: ${esc(l.authority)}.</p>
<h2>Widerspruchsrecht</h2>
<p><strong>Du kannst der Verarbeitung deiner personenbezogenen Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO jederzeit aus Gründen widersprechen, die sich aus deiner besonderen Situation ergeben (Art. 21 DSGVO).</strong></p>`;
}
