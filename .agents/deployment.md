# Deployment Guide

## Domain

- Canonical domain: `https://sudesh.co.in`
- `CNAME` must contain `sudesh.co.in`.
- `www.sudesh.co.in` should redirect to `sudesh.co.in` through GitHub Pages and DNS configuration.

## GitHub Pages

- Deployment workflow: `.github/workflows/deploy.yml`
- Build output: `dist`
- GitHub Pages source should be GitHub Actions.

## DNS Notes

Use GitHub Pages apex `A` records for `sudesh.co.in`.
Use `www` as a CNAME to the GitHub Pages host, usually `sudeshpoojari.github.io`.

## RSS and Sitemap

- RSS route: `src/pages/rss.xml.ts`
- Sitemap route: `src/pages/sitemap-index.xml.ts`
- `public/robots.txt` points to `https://sudesh.co.in/sitemap-index.xml`

When adding or removing public pages, update the sitemap route.
