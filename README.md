# my_cv

An interactive CV that reads like a book. Pages are laid out as two-page spreads
and turn on a hinged leaf; the same content is also served as a clean, paginated
A4 document for printing or saving to PDF.

**Live:** https://linh236.github.io

---

## Getting started

```bash
npm install
npm start          # http://localhost:8080
```

`npm start` runs two watchers side by side:

- **sass** — recompiles `src/scss/` → `public/css/` on save
- **browser-sync** — serves the folder and live-injects CSS changes without a
  full page reload, so the spread you are on stays put

> **The CV must be served over HTTP.** Opening `index.html` directly from disk
> (`file://`) fails: the page fetches its content fragments with XHR, and
> browsers block that on the file protocol. If you do, the book renders an
> explanatory panel rather than a blank page.

### Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Sass watch + live-reloading server on :8080 (what you want day to day) |
| `npm run build` | One-off compressed CSS build, no source maps |
| `npm run sass` | Sass watch only |
| `npm run serve` | Static server only, no watching |

---

## Project structure

```
index.html            Interactive book — the two-page spread shell
pdf.html              Print view — all pages flat, in reading order
chapters.json         Unused (see Housekeeping)

pages/                Content fragments, one per CV page
  infor.html            profile, bio, contact details
  skill_page_1.html     skills, part 1
  skill_page_2.html     skills, part 2
  experience_page_1.html
  experience_page_2.html
  my_project.html
  additional.html       extra info + open source
  thank_you.html        closing panel

src/scss/             Source styles — edit these
  _tokens.scss          design tokens: colour, type, spacing, radii, shadows
  _book.scss            book shell, spread layout, the turning leaf
  _<section>.scss       one partial per content section
  main.scss             screen entry point
  pdf_main.scss         print entry point

public/
  css/                Compiled output — generated, do not edit by hand
  js/main.js          Spread order, page turning, keyboard nav
  js/pdf_main.js      Flattens the spreads into ordered A4 sheets
  images/avatar.jpg
```

`public/css/*.css` is committed on purpose — GitHub Pages serves the repo as-is
and does not run Sass. Recompile and commit the CSS whenever you change SCSS.

---

## How it works

### Spreads

`public/js/main.js` holds the running order as a list of spreads:

```js
var SPREADS = [
  { left: "pages/infor.html",        right: "pages/skill_page_1.html" },
  ...
];
```

All fragments are fetched once on load and cached. That matters for the page
turn — both faces of the turning sheet must be ready the instant it starts, so
loading on demand would flash blank mid-flip.

### The page turn

A turning leaf is one sheet hinged at the spine with two faces: the **front** is
the page you were reading, the **back** is the page that ends up face-up when it
lands. Turning from spread 1 to spread 2:

| | before | during | after |
| --- | --- | --- | --- |
| left half | page 1 | page 1, until the leaf covers it | page 3 *(leaf's back)* |
| the leaf | — | front = page 2, back = page 3, rotating 0° → −180° | removed |
| right half | page 2 | page 4, revealed as the leaf lifts | page 4 |

The destination page is placed underneath immediately — the leaf covers it at
rest, so it is only revealed as the sheet lifts away. Backward turns mirror
this, hinged on the right.

The animation is skipped entirely below 900px (no spine to hinge on — the layout
is a single stacked column there) and when the reader has
`prefers-reduced-motion` set.

If you change the turn duration, change it in **both** places or the content
swap will fall out of step with the animation:

- `FLIP_MS` in `public/js/main.js`
- `--flip-ms` in `src/scss/_book.scss`

### Navigation

Arrow buttons, left/right arrow keys, Home/End, and the progress dots under the
book. Arrows disable at the first and last spread.

### Print view

`pdf.html` renders every page flat and in reading order as A4 sheets, then uses
the browser's own print-to-PDF. This produces selectable text rather than a
screenshot, and `break-inside: avoid` keeps cards and timeline entries from
splitting across sheets. `pdf.html?print=1` opens the print dialog automatically
once all sheets have rendered — that is what the *Download CV (PDF)* button on
the closing page links to.

---

## Customising

### Theme

Every colour, font, space and shadow in the CV comes from custom properties in
`src/scss/_tokens.scss`. Re-theming is a single edit — change `--brand-500` and
the accent updates everywhere.

### Adding a page

1. Create the fragment in `pages/`.
2. Add it to `SPREADS` in `public/js/main.js` (pages come in twos — a spread
   needs a left and a right).
3. Add it to `PAGES` in `public/js/pdf_main.js` so it appears in the PDF too.
4. If it needs its own styles, add `src/scss/_yourpage.scss` and `@use` it from
   both `main.scss` and `pdf_main.scss`.

---

## Deployment

Pushing to `main` triggers `.github/workflows/jekyll-gh-pages.yml`, which
publishes the repo to GitHub Pages. There is no build step in CI, so commit the
compiled `public/css/*.css` along with your SCSS changes.

---

## Housekeeping

A few files are not wired into anything and can be deleted or put to use:

- `pages/education.html` and `pages/service.html` — still placeholder lorem
  ipsum, and not listed in any spread. Styles for both are still compiled
  (`_education.scss`, `_service.scss`) so they are ready if you add them.
- `chapters.json` — not valid JSON and not read by any code.
