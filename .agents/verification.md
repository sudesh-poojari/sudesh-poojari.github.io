# Verification Harness

Use the smallest verification that covers the change.

## Always Consider

- `npm run build`

This runs Astro checks and creates the static build.

## Content-Only Changes

Run:

```sh
npm run build
```

Check:

- Draft posts do not appear publicly.
- Published posts appear in article listing, RSS, and sitemap.
- Dates, titles, and descriptions are correct.

## Layout or Styling Changes

Run:

```sh
npm run build
npm run dev
```

Manually inspect:

- Home page.
- Articles page.
- About page.
- Contact page.
- One mobile-width viewport.
- One desktop-width viewport.

## Contact Form Changes

Run:

```sh
npm run build
```

Manually inspect `/contact/` and confirm:

- Google Form iframe loads.
- Fallback link opens the Google Form.
- No resume or direct email link was reintroduced.

## Deployment Changes

Run:

```sh
npm run build
```

Check:

- `CNAME` contains `sudesh.co.in`.
- `astro.config.mjs` uses `https://sudesh.co.in`.
- `public/robots.txt` points to the apex sitemap URL.
- `.github/workflows/deploy.yml` still builds with `npm run build`.

## Final Response Harness

Report:

- What changed.
- Which command was run.
- Whether it passed.
- Any manual check still needed.
