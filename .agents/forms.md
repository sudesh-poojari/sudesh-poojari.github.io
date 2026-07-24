# Forms Guide

## Contact Form

The contact page embeds a Google Form:

- Page: `src/pages/contact.astro`
- Public route: `/contact/`

The page should include:

- Embedded Google Form iframe.
- A fallback link that opens the Google Form in a new tab.
- No direct email link unless explicitly requested.
- No resume link unless explicitly requested.

## Updating the Form

When the Google Form URL changes:

1. Update `googleFormUrl`.
2. Update `embeddedGoogleFormUrl`.
3. Run `npm run build`.
4. Manually inspect `/contact/` with `npm run dev` or `npm run preview` if the change affects layout.

## Do Not

- Do not collect messages in this repo.
- Do not add backend form handling unless explicitly requested.
- Do not add tracking scripts around the form.
