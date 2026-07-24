# Astro Guide

## Patterns

- Use `.astro` pages and components for static UI.
- Prefer server-rendered Astro templates over client-side components.
- Use content collections through `astro:content`.
- Keep shared metadata and navigation in `src/lib/site.ts`.
- Keep date, sorting, and reading-time helpers in `src/lib/writing.ts`.

## Routes

- Add pages under `src/pages`.
- Add article detail routes through `src/pages/articles/[...slug].astro`.
- Update `src/pages/sitemap-index.xml.ts` when adding important public pages.

## Collections

- Collection schema lives in `src/content/config.ts`.
- The `articles` collection must exist even if all entries are draft.
- Draft articles must not appear in listings, RSS, sitemap, or static paths.

## SEO

- Use `BaseLayout` for page title, description, canonical URL, Open Graph tags, favicon, and RSS link.
- Canonical URLs must stay under `https://sudesh.co.in`.
