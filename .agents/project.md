# Project Guide

## Stack

- Astro static site.
- TypeScript.
- Markdown/MDX-ready content collections.
- GitHub Pages deployment.

## Key Files

- `astro.config.mjs`: Astro config and canonical site URL.
- `src/lib/site.ts`: site metadata and navigation.
- `src/pages/index.astro`: home page.
- `src/pages/articles/index.astro`: articles landing page.
- `src/pages/contact.astro`: Google Form contact page.
- `src/pages/rss.xml.ts`: RSS feed.
- `src/pages/sitemap-index.xml.ts`: static sitemap route.
- `src/content/config.ts`: content collection schema.
- `src/styles/global.css`: global design system.
- `CNAME`: GitHub Pages custom domain.

## Commands

- `npm install`: install dependencies.
- `npm run dev`: run local dev server.
- `npm run build`: run Astro type checks and build.
- `npm run preview`: preview built output.

## Current Public IA

- Home: `/`
- Articles: `/articles/`
- Proficiencies: `/proficiencies/`
- About: `/about/`
- Contact: `/contact/`

Articles currently show a Coming Soon state. Playbooks are intentionally removed.
