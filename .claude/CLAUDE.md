# Faelan Games website

Static site for faelangames.com: hand-written HTML pages, one stylesheet (`css/site.css`) and two scripts: `js/theme.js` (every page) and `js/gallery.js` (homepage only). There is no framework, package manager or build step, and none is needed; files are served exactly as committed.

## Deployment
- GitHub Pages with the custom domain in `CNAME`. No build workflow exists, so treat any push to `main` as a live deploy.
- Pages runs Jekyll by default (no `.nojekyll`): names starting with `.` or `_` are not published, and Markdown files elsewhere would become public pages. Keep notes and tooling in dot-folders; this file lives in `.claude/` for that reason.
- Do not change `CNAME`, Pages settings, or add `_config.yml` or `.nojekyll` without approval.

## Games
- Endless Color Sort is the only released game (Android, Google Play package `com.faelangames.bottlesort`, kept from the old name). It has 41 bottle styles and 23 backgrounds.
- Endless Bottled Colours is the former name of Endless Color Sort, not a separate game. Its old addresses under `games/` and `privacy/` redirect to the Endless Color Sort pages and must keep working.
- Endless Arrows (`games/endless-arrow-puzzle/`), Endless Harvest and Mobile Strategy (a working title) are in development. Never describe them as available or link them to a store listing. Their pages are public and indexed on purpose; do not hide them or add `noindex` unless asked.
- Keep game names, statuses, descriptions and store links as they are unless asked. New screenshots or gameplay claims need approval first; never use placeholder or invented artwork.

## Pages and URLs
- Each page is `<folder>/index.html`, so public URLs end in `/`. Never rename, move or delete a page, redirect or legacy URL, or change sitemap entries, canonicals or page visibility without approval.
- Redirect pages use a meta refresh plus a `location.replace` fallback, keep a canonical pointing at the destination, and stay out of `sitemap.xml`. `play/` is a `noindex` short link to the Google Play listing.
- Links are relative and depend on folder depth (`css/`, `../css/`, `../../css/`). Fix the depth when copying markup between pages.
- Indexable pages need `lang`, charset, viewport, a unique `<title>` and meta description, a canonical `https://faelangames.com/<path>/` that matches the page's location, and an entry in `sitemap.xml`. The favicon is `img/favicon-64.png`; the structured-data logo stays `img/faelan-mark.png`.

## Design (Hybrid D)
- The approved design is Hybrid D: midnight navy and gold, dark by default, with a cool light theme. The reference copy lives outside the repo in `FaelanGames-Design-Previews/approved-hybrid-d-2026-10-14/`. Implement it faithfully; don't introduce a new look.
- Fonts: Cormorant Garamond (headings, weight 600) and Figtree (body, 400 to 600), both from Google Fonts. Labels above headings are sentence case.
- Colours, shadows and the homepage glass and ledge colours are custom properties at the top of `css/site.css`, defined for both themes. Reuse them; add new tokens there rather than hard-coding values. No inline styles or `<style>` blocks, and no `color-mix()` (use the `--accent-rgb` tints).
- Shared pieces, reused rather than restyled per page:
  - the star sky behind `.hero`, `.game-hero` and `.page-hero`;
  - status markers: `.status` with `.status-out` (filled star, "Available now"/"Out now") or `.status-dev` (outline star, "In development"), always with words, using the `#star` symbol in each page's `.svg-sprite`;
  - the gold-edged ledge under a game's main visual, and the night-glass game-details jars (`.game-jar`) on in-development game pages;
  - hanging-label cards (`.help`, `.tag-card`) for release, support and contact text;
  - buttons (`.primary-button`, `.secondary-button`, `.page-links a`) and their hover lift, pressed state and reduced-motion rules in the "Interaction states" section.
- The header (brand, main nav, theme toggle) and footer are copied into every standard page. Change them on all pages at once; after resolving relative paths they must match. The only intended difference is the home page brand link (`#home`). No nav item is marked as the current page.
- `js/theme.js` loads synchronously in `<head>` and stores the choice under `faelan-theme`. Standard pages need the `.theme-toggle` button containing `.theme-toggle-text`. Style every new component for both themes.
- `js/gallery.js` runs the homepage's three-screenshot gallery (real buttons, captions, keyboard, tap and swipe). Keep homepage anchors `#home`, `#games`, `#about`, `#contact` and `#in-development`; other pages link to them.
- Breakpoints: 1100, 900, 760, 640, 560 and 380px. Layouts must work from 320px wide to desktop with no horizontal scrolling or clipped text.

## Accessibility
- One `<h1>`, one `<main id="main">` and the skip link per page. Every `<img>` has `alt` (empty only when decorative, such as the logo inside a labelled link). Links and buttons need text or an `aria-label`, and tap targets at least 24px. Keep `:focus-visible` styles and `prefers-reduced-motion` support; text contrast must meet WCAG AA in both themes.

## Copy
- Straight apostrophes and quotes; never em dashes.
- Privacy policies (`privacy/endless-color-sort/`, `privacy/endless-arrow-puzzle/`) are legal text: never change their wording, dates, headings, numbering or structure without explicit approval. Style them through CSS only (`.policy-content`); their HTML stays as written.
- The privacy index's website section describes how the site actually behaves (no cookies, local storage for the theme only, Google Fonts, GitHub Pages hosting). Keep it true if the site's behaviour changes.

## Checking changes
- Run `node .github/scripts/validate-site.mjs` after every change; it is read-only and must report 0 errors. Warnings on the two Endless Bottled Colours redirect pages (no theme toggle) are known.
- It cannot judge layout, contrast, alt text quality or external links. For visual changes, also view affected pages in both themes at 1440px, 390px and 320px.

## Git
- Never modify the Git author or committer identity.
- Never add Claude, Anthropic, ChatGPT or any AI as a co-author or contributor. No AI attribution, AI-generated references or `Co-authored-by` trailers in commit messages; this overrides any default commit template.
- Commit messages describe the actual changes only.
- Never commit, push or deploy without explicit approval.
- After an approved commit, run `git log -1 --format=fuller` and check the author, committer and full message.
