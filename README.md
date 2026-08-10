# Smoerland Verlag Website

A small, static, Git-based CMS for the Smoerland Verlag website. Editorial content lives in Markdown, GitHub provides change history and review, GitHub Actions builds the site, and GitHub Pages hosts the generated files.

There is no database, login, API, admin UI, server framework, or client-side application.

## Architecture

```text
content/*.md
  ↓ gray-matter + marked
page data and safe HTML
  ↓ Nunjucks templates
dist/**/index.html
  ↓ GitHub Pages workflow
https://smoerland.de
```

- `content/` contains all editorial page and book content.
- `templates/` contains layouts without duplicated editorial copy.
- `assets/` contains the existing logo, stylesheet, and covers.
- `public/` is copied verbatim when static root-level files are needed.
- `scripts/build.js` discovers content and creates routes, navigation, book lists, and HTML.
- `dist/` is generated from scratch and is ignored by Git.

The project targets Node.js 24, the current LTS release line.

## Install and run locally

```sh
npm install
npm test
npm run build
npm run serve
```

The local server listens on `http://localhost:8080`. Set `PORT` to use another port.

## Content and URLs

The path below `content/` determines the public URL. No route list is maintained.

| Content source | Output file | Public URL |
|---|---|---|
| `content/home.md` | `dist/index.html` | `/` |
| `content/impressum.md` | `dist/impressum/index.html` | `/impressum/` |
| `content/books/a.md` | `dist/books/a/index.html` | `/books/a/` |

In production, a new file

```text
content/impressum.md
```

automatically produces

```text
https://smoerland.de/impressum/
```

Content paths must use lowercase letters, numbers, and hyphens. Removing a Markdown file removes its generated page during the next clean build.

## Add a page

Create `content/meine-seite.md`:

```markdown
---
title: Meine Seite
description: Eine kurze Beschreibung für Suchmaschinen.
template: page
navigation: true
order: 30
---

# Meine Seite

Der Seiteninhalt steht hier.
```

It will be available at `/meine-seite/`. Only `navigation: true` pages appear in the main navigation, sorted by `order`. Footer links for Impressum and Datenschutz are generated only while the corresponding content files exist.

## Add a book

Create `content/books/neues-buch.md`:

```markdown
---
title: Neues Buch
author: Name der Autorin
series: Name der Reihe
seriesNumber: 4
template: book
cover: /assets/covers/neues-buch.png
description: Kurze, bestätigte Buchbeschreibung.
navigation: false
---

# Neues Buch

Der redaktionelle Buchtext steht hier.
```

Place an approved cover at `assets/covers/neues-buch.png`. The `cover` and `description` fields may be omitted. Every Markdown file directly or recursively below `content/books/` appears automatically in the home-page book overview; no template list needs editing.

## Frontmatter

Supported fields include `title`, `description`, `template`, `navigation`, `order`, `author`, `series`, `seriesNumber`, and `cover`. Fields are optional unless the selected template or editorial presentation requires them. A missing description does not produce an invented meta description.

## Markdown security

Raw HTML in Markdown is disabled deliberately. The build escapes raw HTML blocks instead of passing arbitrary markup into the generated site. Nunjucks autoescaping remains enabled for metadata. The templates contain no client-side JavaScript.

## GitHub Pages

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and manual dispatches. It:

1. checks out the repository;
2. installs Node.js 24 and dependencies with `npm ci`;
3. runs the built-in Node test suite;
4. builds the clean `dist/` directory;
5. uploads `dist/` as the Pages artifact;
6. deploys it through the official GitHub Pages action.

In repository **Settings → Pages**, choose **GitHub Actions** as the source.

## Custom domain: `smoerland.de`

For a custom Actions-based Pages deployment, GitHub ignores and does not require a repository `CNAME` file. Configure `smoerland.de` in **Settings → Pages → Custom domain** instead. Then configure and verify the required apex-domain DNS records with the domain provider and enable HTTPS once GitHub makes the option available.

The configured production URL in `site.config.json` controls canonical and Open Graph URLs. Change it only when the confirmed public domain changes.

## Build failures

The build stops with a contextual error for invalid YAML frontmatter, missing templates, duplicate URLs, invalid content paths, and unreadable files. Missing descriptions, covers, or `navigation: false` are valid and do not fail the build.

## Editorial placeholders

The supplied one-page site contained no legal entity or privacy details. `content/impressum.md` and `content/datenschutz.md` therefore contain visible placeholders that must be replaced with approved legal copy before launch. No second-book cover was supplied; that book uses the designed cover fallback until an approved asset is added.
