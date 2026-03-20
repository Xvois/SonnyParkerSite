# Copilot Instructions for this Repository

This repo is a **static personal website** for Sonny Parker. It is intentionally minimal and primarily consists of a few HTML pages, a small stylesheet, and some static resources.

---

## 🧭 What this repo contains

- `index.html` — home page with links to project pages.
- `nbt.html` — project page describing the NBT (N-body test) project.
- `juliaeuler.html` — project page describing the JuliaEuler project.
- `styles.css` — shared CSS used by all pages.
- `script.js` — intentionally minimal placeholder JS (currently empty).
- `resources/` — static assets used by the site (images, etc.).

The site is designed to be hosted as a static site (GitHub Pages, plain file server, etc.).

---

## 🚀 Local development (run the site locally)

From the project root run:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

> Tip: VS Code has a task configured for this under **Terminal → Run Task → Serve Resume Site**.

---

## 🛠️ Common tasks you may ask the assistant to do

### Content / Copy
- Update project descriptions, links, headings, or metadata.
- Add a new project page following the existing structure.
- Improve accessibility (alt text, semantic HTML, aria attributes).

### Styling / UX
- Make the site responsive or improve the visual design with CSS.
- Add new layout components (cards, grid sections, navigation updates).

### Performance / Best practices
- Optimize images used in `resources/`.
- Improve page load performance (preload hints, reduce render-blocking assets).

### Site structure / organization
- Add new resource directories or update `sitemap.xml` / `robots.txt` for new pages.
- Update the breadcrumb navigation pattern used in pages.

---

## 📌 Project conventions

- The site is static HTML/CSS with minimal JavaScript.
- CSS is loaded non-blocking via `media="print"` + `onload="this.media='all'"` with a `<noscript>` fallback.
- MathJax is loaded asynchronously when needed for math formulas.
- Pages use a simple breadcrumb header pattern (see `index.html`, `nbt.html`, `juliaeuler.html`).

---

## 🔎 Where to look

- **Main pages:** `index.html`, `nbt.html`, `juliaeuler.html`
- **Styles:** `styles.css`
- **Static assets:** `resources/` (images, etc.)

---

## 🧪 How to verify changes

- Run the local server (see above) and open `http://localhost:8000` to check changes.
- Use browser developer tools to inspect layout, accessibility, and console warnings.

---

## 📝 Notes for Copilot agents (this file)

- Keep suggestions aligned with a small static site; avoid proposing large frameworks.
- Prefer lightweight, zero-build solutions (plain HTML/CSS/JS).
- If asked to add functionality requiring tooling (build systems, bundlers), ask for confirmation before adding new dependencies.
