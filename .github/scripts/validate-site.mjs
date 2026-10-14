#!/usr/bin/env node
/*
 * Read-only checks for the Faelan Games static site. No dependencies.
 *
 * Run from anywhere:
 *     node .github/scripts/validate-site.mjs
 *
 * Exit code 0: no errors (warnings may still be listed).
 * Exit code 1: at least one error.
 * Exit code 2: the validator itself failed.
 *
 * It reads files and never writes them. It parses HTML with a small tokenizer
 * that suits this hand-written markup; it is not a full HTML parser and does
 * not validate syntax or nesting. It cannot judge visual layout, colour
 * contrast, responsive behaviour, whether alt text is accurate, or whether
 * external links are live (it makes no network requests).
 *
 * The folder is dot-prefixed so GitHub Pages (Jekyll) does not publish it.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/*
 * Facts about the games that the markup cannot tell us. Endless Color Sort is
 * the only released game; its Play package ID keeps the old working name.
 * Endless Bottled Colours was that same game's working title, and its old
 * addresses must keep redirecting to the current pages.
 */
const RELEASED_PLAY_PACKAGES = ["com.faelangames.bottlesort"];

const LEGACY_REDIRECTS = {
    "/games/endless-bottled-colours/": "/games/endless-color-sort/",
    "/privacy/endless-bottled-colours/": "/privacy/endless-color-sort/",
    "/play/": "https://play.google.com/store/apps/details?id=com.faelangames.bottlesort",
};

const STYLESHEET = "/css/site.css";
const THEME_SCRIPT = "/js/theme.js";

/* Straight quotes and no em dashes in public copy. */
const BANNED_PUNCTUATION = [
    [/—|&mdash;|&#8212;|&#x2014;/gi, "em dash"],
    [/[‘’]|&[lr]squo;|&#821[67];|&#x201[89];/gi, "curly apostrophe or single quote"],
    [/[“”]|&[lr]dquo;|&#822[01];|&#x201[cd];/gi, "curly double quote"],
];

const URL_ATTRIBUTES = {
    a: ["href"],
    link: ["href"],
    script: ["src"],
    img: ["src", "srcset"],
    source: ["src", "srcset"],
    video: ["src", "poster"],
    audio: ["src"],
    track: ["src"],
    iframe: ["src"],
};

const issues = [];

function report(level, file, line, check, message) {
    issues.push({ level, file, line, check, message });
}

const error = (...args) => report("error", ...args);
const warning = (...args) => report("warning", ...args);

/* ---------- Files ---------- */

const dirCache = new Map();

function listDir(absDir) {
    if (!dirCache.has(absDir)) {
        let entries = null;
        try {
            entries = readdirSync(absDir);
        } catch {
            entries = null;
        }
        dirCache.set(absDir, entries);
    }
    return dirCache.get(absDir);
}

/* GitHub Pages runs Jekyll, which skips names starting with "." or "_". */
function isPublishedName(name) {
    return !/^[._]/.test(name) && name !== "node_modules";
}

function findHtmlFiles(absDir = ROOT) {
    const found = [];
    for (const name of listDir(absDir) || []) {
        if (!isPublishedName(name)) continue;
        const abs = join(absDir, name);
        if (statSync(abs).isDirectory()) found.push(...findHtmlFiles(abs));
        else if (name.endsWith(".html")) found.push(relative(ROOT, abs).split(sep).join("/"));
    }
    return found.sort();
}

/*
 * Maps a site path such as "/games/x/" to a repository file, matching letter
 * case exactly: Windows ignores case, GitHub Pages does not.
 */
function lookup(sitePath) {
    let decoded;
    try {
        decoded = decodeURIComponent(sitePath);
    } catch {
        return { problem: "malformed URL encoding" };
    }
    const segments = decoded.split("/").filter(Boolean);
    let abs = ROOT;
    for (const segment of segments) {
        if (!isPublishedName(segment)) {
            return { problem: `"${segment}" is not published (GitHub Pages skips names starting with . or _)` };
        }
        const entries = listDir(abs) || [];
        if (!entries.includes(segment)) {
            const near = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
            return {
                problem: near
                    ? `letter case differs: "${segment}" is "${near}" on disk (GitHub Pages is case-sensitive)`
                    : "no such file or folder",
            };
        }
        abs = join(abs, segment);
    }
    if (statSync(abs).isDirectory()) {
        if (!(listDir(abs) || []).includes("index.html")) return { problem: "folder has no index.html" };
        return { file: [...segments, "index.html"].join("/") };
    }
    if (decoded.endsWith("/")) return { problem: "is a file, not a folder" };
    return { file: segments.join("/") };
}

function sitePathFor(file) {
    return "/" + file.replace(/(^|\/)index\.html$/, "$1");
}

/* ---------- HTML tokenizer ---------- */

function decodeEntities(value) {
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;|&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

function parseAttributes(source) {
    const attrs = {};
    const pattern = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = pattern.exec(source))) {
        const name = match[1].toLowerCase();
        if (!(name in attrs)) attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
    }
    return attrs;
}

function tokenize(source) {
    const lineStarts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);
    const lineAt = (pos) => {
        let low = 0;
        let high = lineStarts.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid] <= pos) low = mid;
            else high = mid - 1;
        }
        return low + 1;
    };

    const tokens = [];
    const lower = source.toLowerCase();
    const pattern = /<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let last = 0;
    let match;

    while ((match = pattern.exec(source))) {
        if (match.index > last) tokens.push({ type: "text", raw: source.slice(last, match.index), pos: last });
        const [raw, closing, rawName, rawAttrs] = match;

        if (raw.startsWith("<!--")) {
            tokens.push({ type: "comment", raw, pos: match.index });
        } else if (rawName) {
            const name = rawName.toLowerCase();
            if (closing) {
                tokens.push({ type: "end", name, raw, pos: match.index });
            } else {
                const attrs = parseAttributes(rawAttrs);
                tokens.push({ type: "start", name, attrs, raw, pos: match.index });
                if (name === "script" || name === "style") {
                    const close = lower.indexOf(`</${name}`, pattern.lastIndex);
                    const end = close === -1 ? source.length : close;
                    tokens.push({ type: "raw", parent: name, attrs, raw: source.slice(pattern.lastIndex, end), pos: pattern.lastIndex });
                    pattern.lastIndex = end;
                }
            }
        }
        last = pattern.lastIndex;
    }
    if (last < source.length) tokens.push({ type: "text", raw: source.slice(last), pos: last });

    for (const token of tokens) token.line = lineAt(token.pos);
    return tokens;
}

const hasClass = (token, name) => (token.attrs?.class || "").split(/\s+/).includes(name);
const relList = (token) => (token.attrs?.rel || "").toLowerCase().split(/\s+/);

/* Returns each element (start tag through matching end tag) of the given name and class. */
function elements(tokens, name, className) {
    const found = [];
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== "start" || token.name !== name || (className && !hasClass(token, className))) continue;
        let depth = 0;
        let j = i;
        for (; j < tokens.length; j++) {
            if (tokens[j].type === "start" && tokens[j].name === name) depth++;
            if (tokens[j].type === "end" && tokens[j].name === name && --depth === 0) break;
        }
        found.push(tokens.slice(i, j + 1));
        i = j;
    }
    return found;
}

/* ---------- URLs ---------- */

let SITE;

function classify(value, page) {
    const trimmed = value.trim();
    if (trimmed === "") return { kind: "empty" };
    if (/^(mailto|tel|sms|javascript|data):/i.test(trimmed)) return { kind: "other" };
    let url;
    try {
        url = new URL(trimmed, SITE.origin + page.sitePath);
    } catch {
        return { kind: "malformed" };
    }
    if (!/^https?:$/.test(url.protocol)) return { kind: "other" };
    if (url.host !== SITE.host && url.host !== "www." + SITE.host) return { kind: "external", url };
    return { kind: "local", url, path: url.pathname, hash: url.hash.slice(1), insecure: url.protocol === "http:" };
}

/* ---------- Page model ---------- */

function loadPage(file) {
    const source = readFileSync(join(ROOT, file), "utf8");
    const tokens = tokenize(source);
    const page = { file, sitePath: sitePathFor(file), tokens, ids: new Map(), refs: [] };

    let inHead = false;
    for (const token of tokens) {
        if (token.type === "start" && token.name === "head") inHead = true;
        if ((token.type === "end" && token.name === "head") || (token.type === "start" && token.name === "body")) inHead = false;
        token.inHead = inHead;

        if (token.type !== "start") continue;
        if (token.attrs.id) {
            if (page.ids.has(token.attrs.id)) error(file, token.line, "html", `duplicate id "${token.attrs.id}" (first on line ${page.ids.get(token.attrs.id)})`);
            else page.ids.set(token.attrs.id, token.line);
        }
    }

    const metas = tokens.filter((t) => t.type === "start" && t.name === "meta");
    const meta = (key, value) => metas.find((t) => (t.attrs[key] || "").toLowerCase() === value);

    page.html = tokens.find((t) => t.type === "start" && t.name === "html");
    page.charset = metas.find((t) => "charset" in t.attrs);
    page.viewport = meta("name", "viewport");
    page.description = meta("name", "description");
    page.robots = meta("name", "robots");
    page.noindex = /noindex/i.test(page.robots?.attrs.content || "");
    page.refresh = meta("http-equiv", "refresh");
    page.canonicals = tokens.filter((t) => t.type === "start" && t.name === "link" && relList(t).includes("canonical"));

    const titleStart = tokens.findIndex((t) => t.type === "start" && t.name === "title");
    page.title = titleStart === -1 ? null : decodeEntities(tokens[titleStart + 1]?.type === "text" ? tokens[titleStart + 1].raw : "").replace(/\s+/g, " ").trim();
    page.titleLine = tokens[titleStart]?.line;

    if (page.refresh) {
        const target = /url\s*=\s*['"]?([^'"]+)/i.exec(page.refresh.attrs.content || "");
        page.redirect = target ? classify(target[1], page) : { kind: "malformed" };
    }
    return page;
}

/* ---------- Checks ---------- */

function checkMetadata(page) {
    const { file } = page;
    if (!page.html?.attrs.lang) error(file, page.html?.line || 1, "metadata", "<html> has no lang attribute");
    if (!page.charset) error(file, 1, "metadata", "missing <meta charset>");
    if (!page.viewport) error(file, 1, "metadata", "missing <meta name=\"viewport\">");
    if (!page.title) error(file, page.titleLine || 1, "metadata", "missing or empty <title>");
    if (!page.description?.attrs.content?.trim()) error(file, page.description?.line || 1, "metadata", "missing or empty meta description");

    if (page.canonicals.length !== 1) {
        error(file, page.canonicals[1]?.line || 1, "canonical", `expected one canonical link, found ${page.canonicals.length}`);
        return;
    }
    const canonical = page.canonicals[0];
    const href = canonical.attrs.href || "";
    if (!href.startsWith(SITE.origin + "/")) {
        error(file, canonical.line, "canonical", `canonical must be an absolute ${SITE.origin}/ URL, found "${href}"`);
        return;
    }
    const target = classify(href, page);
    const found = lookup(target.path);
    if (found.problem) error(file, canonical.line, "canonical", `canonical ${href} does not match a page: ${found.problem}`);
    page.canonicalPath = target.path;

    const internalRedirect = page.redirect?.kind === "local";
    const expected = internalRedirect ? page.redirect.path : page.sitePath;
    if (target.path !== expected) {
        const why = internalRedirect ? "the redirect destination" : "the page's own location";
        error(file, canonical.line, "canonical", `canonical points to ${target.path} but should match ${why} (${expected})`);
    }
}

function checkReferences(page) {
    const { file, tokens } = page;
    const add = (token, attr, value) => {
        const target = classify(value, page);
        if (target.kind === "malformed") error(file, token.line, "links", `malformed URL in ${attr}: "${value}"`);
        if (target.kind === "local") page.refs.push({ line: token.line, attr, value, ...target });
    };

    for (const token of tokens) {
        if (token.type === "start") {
            for (const attr of URL_ATTRIBUTES[token.name] || []) {
                if (!(attr in token.attrs)) continue;
                if (attr === "srcset") {
                    for (const candidate of token.attrs.srcset.split(",")) {
                        const url = candidate.trim().split(/\s+/)[0];
                        if (url) add(token, attr, url);
                    }
                } else if (!(token.name === "link" && relList(token).includes("canonical"))) {
                    add(token, attr, token.attrs[attr]);
                }
            }
            if (token.name === "meta" && /^(og:image|og:url|twitter:image)$/i.test(token.attrs.property || token.attrs.name || "")) {
                add(token, token.attrs.property || token.attrs.name, token.attrs.content || "");
            }
            if (token.name === "img" && !("alt" in token.attrs)) {
                error(file, token.line, "images", `<img src="${token.attrs.src || ""}"> has no alt attribute`);
            } else if (token.name === "img" && /(\.(png|jpe?g|webp|gif|svg|avif)$)|^(image|img|photo|picture|graphic|logo|icon|screenshot|untitled)$/i.test(token.attrs.alt.trim())) {
                warning(file, token.line, "images", `alt text "${token.attrs.alt}" looks like a file name or placeholder`);
            }
        }

        if (token.type === "raw" && token.parent === "script" && (token.attrs.type || "").toLowerCase() === "application/ld+json") {
            try {
                JSON.parse(token.raw);
            } catch (problem) {
                error(file, token.line, "structured-data", `JSON-LD does not parse: ${problem.message}`);
            }
            for (const match of token.raw.matchAll(/"(https?:\/\/[^"\s]+)"/g)) add(token, "JSON-LD", match[1]);
        }
    }

    if (page.refresh) {
        if (page.redirect.kind === "malformed") error(file, page.refresh.line, "redirect", "meta refresh has no readable url=");
        else if (page.redirect.kind === "local") page.refs.push({ line: page.refresh.line, attr: "meta refresh", value: page.redirect.url.href, ...page.redirect });

        /* A literal location.replace() fallback must agree with the meta refresh. */
        for (const token of tokens) {
            if (token.type !== "raw" || token.parent !== "script") continue;
            for (const match of token.raw.matchAll(/location\.(?:replace|assign)\(\s*["']([^"']+)["']/g)) {
                const scripted = classify(match[1], page);
                if (scripted.url && page.redirect.url && scripted.url.href !== page.redirect.url.href) {
                    error(file, token.line, "redirect", `script redirects to ${scripted.url.href} but meta refresh goes to ${page.redirect.url.href}`);
                }
            }
        }
    }
}

function checkPunctuation(page) {
    for (const token of page.tokens) {
        const isPublic =
            token.type === "text" ||
            token.type === "start" ||
            (token.type === "raw" && (token.attrs.type || "").toLowerCase() === "application/ld+json");
        if (!isPublic) continue;
        for (const [pattern, label] of BANNED_PUNCTUATION) {
            for (const match of token.raw.matchAll(pattern)) {
                const line = token.line + (token.raw.slice(0, match.index).match(/\n/g) || []).length;
                const context = token.raw.slice(Math.max(0, match.index - 25), match.index + 25).replace(/\s+/g, " ").trim();
                error(page.file, line, "punctuation", `${label} in "${context}"`);
            }
        }
    }
}

function checkAccessibility(page) {
    const { file, tokens } = page;
    const count = (name) => tokens.filter((t) => t.type === "start" && t.name === name).length;

    const h1s = count("h1");
    if (h1s === 0) error(file, 1, "accessibility", "page has no <h1>");
    if (h1s > 1) warning(file, 1, "accessibility", `page has ${h1s} <h1> elements`);

    if (page.redirect) return;

    if (count("main") !== 1) error(file, 1, "accessibility", `expected one <main>, found ${count("main")}`);
    if (!tokens.some((t) => t.type === "start" && t.name === "a" && hasClass(t, "skip-link"))) {
        error(file, 1, "accessibility", "missing skip link (<a class=\"skip-link\" href=\"#main\">)");
    }

    /* Links and buttons need text or a label. Text added later by CSS or JS is not visible here. */
    const open = [];
    for (const token of tokens) {
        if (token.type === "start" && (token.name === "a" || token.name === "button")) {
            open.push({ token, named: Boolean(token.attrs["aria-label"] || token.attrs["aria-labelledby"]) });
        } else if (token.type === "text" && token.raw.trim()) {
            open.forEach((entry) => (entry.named = true));
        } else if (token.type === "start" && token.name === "img" && token.attrs.alt?.trim()) {
            open.forEach((entry) => (entry.named = true));
        } else if (token.type === "end" && (token.name === "a" || token.name === "button")) {
            const entry = open.pop();
            if (entry && !entry.named) error(file, entry.token.line, "accessibility", `<${entry.token.name}> has no text or aria-label`);
        }
    }
}

function checkTheme(page) {
    const { file, tokens } = page;
    const links = (kind) =>
        tokens.filter((t) => t.type === "start" && (kind === "style"
            ? t.name === "link" && relList(t).includes("stylesheet")
            : t.name === "script" && t.attrs.src));
    const pointsTo = (token, path) => classify(token.attrs.href || token.attrs.src || "", page).path === path;

    const stylesheet = links("style").find((t) => pointsTo(t, STYLESHEET));
    const theme = links("script").find((t) => pointsTo(t, THEME_SCRIPT));
    const toggles = tokens.filter((t) => t.type === "start" && hasClass(t, "theme-toggle"));

    if (toggles.length && !theme) error(file, toggles[0].line, "theme", "theme toggle present but js/theme.js is not loaded");

    if (page.redirect) return;

    if (!stylesheet) error(file, 1, "theme", `does not load ${STYLESHEET}`);
    if (!theme) {
        error(file, 1, "theme", `does not load ${THEME_SCRIPT}`);
    } else {
        if (!theme.inHead) error(file, theme.line, "theme", "js/theme.js must load in <head> so the theme applies before paint");
        if ("async" in theme.attrs || "defer" in theme.attrs || theme.attrs.type === "module") {
            error(file, theme.line, "theme", "js/theme.js must load synchronously (no async, defer or type=module)");
        }
    }

    if (toggles.length !== 1) {
        error(file, toggles[1]?.line || 1, "theme", `expected one .theme-toggle, found ${toggles.length}`);
        return;
    }
    const [button] = elements(tokens, toggles[0].name, "theme-toggle");
    if (!button.some((t) => t.type === "start" && hasClass(t, "theme-toggle-text"))) {
        error(file, toggles[0].line, "theme", ".theme-toggle has no .theme-toggle-text inside (theme.js writes to it)");
    }
}

/* ---------- Shared header and footer ---------- */

/*
 * Each region becomes a list of entries with every URL resolved to a site
 * path, so pages at different depths compare equal. "loose" also treats a
 * fragment link to the current page as a link to the page itself, which is
 * how the home page writes its brand link ("#home").
 */
function signature(page, region) {
    const render = (token, loose) => {
        if (token.type === "end") return `</${token.name}>`;
        if (token.type !== "start") return token.raw.replace(/\s+/g, " ").trim();
        const attrs = Object.keys(token.attrs).sort().map((name) => {
            let value = token.attrs[name];
            if ((URL_ATTRIBUTES[token.name] || []).includes(name)) {
                const target = classify(value, page);
                if (target.kind === "local") {
                    value = target.path + (target.hash && !(loose && target.path === page.sitePath) ? "#" + target.hash : "");
                }
            }
            return `${name}="${value}"`;
        });
        return `<${[token.name, ...attrs].join(" ")}>`;
    };
    return region
        .filter((t) => t.type === "start" || t.type === "end" || (t.type === "text" && t.raw.trim()))
        .map((token) => ({ strict: render(token, false), loose: render(token, true), line: token.line }));
}

function diff(entries, reference) {
    const same = (a, b) => a.strict === b.strict || a.loose === b.strict;
    const rows = entries.length;
    const cols = reference.length;
    const table = Array.from({ length: rows + 1 }, () => new Uint16Array(cols + 1));
    for (let i = rows - 1; i >= 0; i--) {
        for (let j = cols - 1; j >= 0; j--) {
            table[i][j] = same(entries[i], reference[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }
    const runs = [];
    let i = 0;
    let j = 0;
    const push = (kind, text, line) => {
        const last = runs[runs.length - 1];
        if (last && last.kind === kind && last.open) last.count++;
        else runs.push({ kind, text, line, count: 1, open: true });
    };
    while (i < rows || j < cols) {
        if (i < rows && j < cols && same(entries[i], reference[j])) {
            runs.forEach((run) => (run.open = false));
            i++;
            j++;
        } else if (j < cols && (i >= rows || table[i][j + 1] >= table[i + 1][j])) {
            push("missing", reference[j].strict, entries[Math.min(i, rows - 1)]?.line);
            j++;
        } else {
            push("unexpected", entries[i].strict, entries[i].line);
            i++;
        }
    }
    return runs;
}

function checkSharedRegions(pages) {
    for (const [name, className] of [["header", "site-header"], ["footer", "site-footer"]]) {
        const label = `${name}.${className}`;
        const withRegion = [];

        for (const page of pages) {
            const found = elements(page.tokens, name, className);
            if (found.length > 1) error(page.file, found[1][0].line, "shared-layout", `more than one ${label}`);
            if (found.length === 0) {
                if (!page.redirect) error(page.file, 1, "shared-layout", `missing ${label}`);
                continue;
            }
            withRegion.push({ page, entries: signature(page, found[0]) });
        }

        /* The version most standard pages share is the reference. */
        const tally = new Map();
        for (const item of withRegion.filter((item) => !item.page.redirect)) {
            const key = item.entries.map((e) => e.strict).join("\n");
            tally.set(key, [...(tally.get(key) || []), item]);
        }
        const majority = [...tally.values()].sort((a, b) => b.length - a.length)[0];
        if (!majority) continue;
        const reference = majority[0].entries;

        for (const { page, entries } of withRegion) {
            const runs = diff(entries, reference);
            const report = page.redirect ? warning : error;
            const note = page.redirect ? " (redirect page)" : "";
            for (const run of runs.slice(0, 4)) {
                const more = run.count > 1 ? ` and ${run.count - 1} more item(s)` : "";
                const verb = run.kind === "missing" ? "missing" : "unexpected";
                report(page.file, run.line || 1, "shared-layout", `${name} differs from the shared ${name}${note}: ${verb} ${run.text}${more}`);
            }
            if (runs.length > 4) report(page.file, 1, "shared-layout", `${name}: ${runs.length - 4} further difference(s)`);
        }
    }
}

/* ---------- Site-wide ---------- */

function checkLinkTargets(pages) {
    const byFile = new Map(pages.map((page) => [page.file, page]));
    for (const page of pages) {
        for (const ref of page.refs) {
            if (ref.insecure) warning(page.file, ref.line, "links", `${ref.value} uses http:, use https:`);
            const found = lookup(ref.path);
            if (found.problem) {
                error(page.file, ref.line, "links", `${ref.attr} "${ref.value}" -> ${ref.path}: ${found.problem}`);
                continue;
            }
            const hash = ref.hash && !ref.hash.startsWith(":~:") ? decodeURIComponent(ref.hash) : "";
            const target = byFile.get(found.file);
            if (hash && target && !target.ids.has(hash)) {
                error(page.file, ref.line, "links", `${ref.attr} "${ref.value}": no element with id="${hash}" in ${found.file}`);
            }
        }
    }
}

function checkStylesheetUrls() {
    const cssDir = join(ROOT, "css");
    for (const name of listDir(cssDir) || []) {
        if (!name.endsWith(".css")) continue;
        const file = `css/${name}`;
        const source = readFileSync(join(cssDir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
        for (const match of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/g)) {
            const value = match[1] || match[2];
            const line = source.slice(0, match.index).split("\n").length;
            const target = classify(value, { sitePath: `/${file}` });
            if (target.kind !== "local") continue;
            const found = lookup(target.path);
            if (found.problem) error(file, line, "links", `url(${value}) -> ${target.path}: ${found.problem}`);
        }
    }
}

function checkSitemap(pages) {
    const file = "sitemap.xml";
    if (!existsSync(join(ROOT, file))) {
        error(file, 1, "sitemap", "sitemap.xml is missing");
        return;
    }
    const source = readFileSync(join(ROOT, file), "utf8");
    if (!/<urlset[\s>]/.test(source)) error(file, 1, "sitemap", "no <urlset> root element");

    const urlCount = (source.match(/<url>/g) || []).length;
    const locs = [...source.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) => ({
        url: decodeEntities(m[1]),
        line: source.slice(0, m.index).split("\n").length,
    }));
    if (urlCount !== locs.length) error(file, 1, "sitemap", `${urlCount} <url> entries but ${locs.length} <loc> values`);

    const byPath = new Map(pages.map((page) => [page.sitePath, page]));
    const listed = new Set();
    for (const { url, line } of locs) {
        if (!url.startsWith(SITE.origin + "/")) {
            error(file, line, "sitemap", `${url} is not an absolute ${SITE.origin}/ URL`);
            continue;
        }
        const path = new URL(url).pathname;
        if (listed.has(path)) error(file, line, "sitemap", `${url} is listed twice`);
        listed.add(path);

        const page = byPath.get(path);
        if (!page) {
            error(file, line, "sitemap", `${url} does not match a page: ${lookup(path).problem || "not an HTML page"}`);
        } else if (page.redirect) {
            error(file, line, "sitemap", `${url} is a redirect and should not be listed`);
        } else if (page.noindex) {
            error(file, line, "sitemap", `${url} is marked noindex and should not be listed`);
        } else if (page.canonicalPath && page.canonicalPath !== path) {
            error(file, line, "sitemap", `${url} declares a different canonical (${page.canonicalPath})`);
        }
    }

    for (const page of pages) {
        const indexable = !page.redirect && !page.noindex && page.canonicalPath === page.sitePath;
        if (indexable && !listed.has(page.sitePath)) error(page.file, 1, "sitemap", `indexable page ${SITE.origin}${page.sitePath} is not in sitemap.xml`);
    }

    if (existsSync(join(ROOT, "robots.txt"))) {
        const robots = readFileSync(join(ROOT, "robots.txt"), "utf8");
        const declared = /^sitemap:\s*(\S+)/im.exec(robots)?.[1];
        if (declared !== `${SITE.origin}/sitemap.xml`) error("robots.txt", 1, "sitemap", `Sitemap line should be ${SITE.origin}/sitemap.xml, found ${declared || "none"}`);
    }
}

function checkDuplicates(pages, field, label) {
    const seen = new Map();
    for (const page of pages.filter((p) => !p.redirect && !p.noindex)) {
        const value = field(page);
        if (!value) continue;
        if (seen.has(value)) warning(page.file, 1, "metadata", `same ${label} as ${seen.get(value)}`);
        else seen.set(value, page.file);
    }
}

function checkGames(pages) {
    const byPath = new Map(pages.map((page) => [page.sitePath, page]));

    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
        const page = byPath.get(from);
        if (!page) {
            error("(site)", 1, "legacy-urls", `${from} no longer exists; old addresses must keep working`);
        } else if (!page.redirect?.url) {
            error(page.file, 1, "legacy-urls", `${from} should redirect to ${to} but has no meta refresh`);
        } else {
            const actual = page.redirect.kind === "local" ? page.redirect.path : page.redirect.url.href;
            if (actual !== to) error(page.file, page.refresh.line, "legacy-urls", `${from} redirects to ${actual}, expected ${to}`);
        }
    }

    /* Only released games may link to a Google Play listing. */
    for (const page of pages) {
        for (const token of page.tokens) {
            if (token.type !== "start" && token.type !== "raw") continue;
            const text = token.type === "start" ? Object.values(token.attrs).join(" ") : token.raw;
            for (const match of text.matchAll(/play\.google\.com\/store\/apps\/details\?id=([\w.]+)/g)) {
                if (!RELEASED_PLAY_PACKAGES.includes(match[1])) {
                    error(page.file, token.line, "game-status", `links to Google Play package ${match[1]}, which is not a released game`);
                }
            }
        }
    }
}

/* ---------- Run ---------- */

function main() {
    const cname = existsSync(join(ROOT, "CNAME")) ? readFileSync(join(ROOT, "CNAME"), "utf8").trim() : "";
    if (!cname) throw new Error("CNAME is missing or empty, so the site origin is unknown");
    SITE = { host: cname, origin: `https://${cname}` };

    const pages = findHtmlFiles().map(loadPage);
    for (const page of pages) {
        checkMetadata(page);
        checkReferences(page);
        checkPunctuation(page);
        checkAccessibility(page);
        checkTheme(page);
    }
    checkSharedRegions(pages);
    checkLinkTargets(pages);
    checkStylesheetUrls();
    checkSitemap(pages);
    checkDuplicates(pages, (page) => page.title, "<title>");
    checkDuplicates(pages, (page) => page.description?.attrs.content?.trim(), "meta description");
    checkGames(pages);

    const redirects = pages.filter((page) => page.redirect).length;
    console.log(`Checked ${pages.length} pages (${pages.length - redirects} standard, ${redirects} redirects) for ${SITE.origin}\n`);

    const byFile = new Map();
    for (const issue of issues) byFile.set(issue.file, [...(byFile.get(issue.file) || []), issue]);
    for (const [file, list] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
        console.log(file);
        for (const issue of list.sort((a, b) => a.line - b.line)) {
            console.log(`  ${String(issue.line).padStart(4)}  ${issue.level.padEnd(7)}  ${issue.check.padEnd(14)}  ${issue.message}`);
        }
        console.log("");
    }

    const errors = issues.filter((issue) => issue.level === "error").length;
    const warnings = issues.length - errors;
    console.log(errors || warnings ? `${errors} error(s), ${warnings} warning(s).` : "No problems found.");
    process.exitCode = errors ? 1 : 0;
}

try {
    main();
} catch (problem) {
    console.error(`validate-site failed: ${problem.stack || problem}`);
    process.exitCode = 2;
}
