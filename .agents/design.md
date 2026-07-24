# Design Guide

## Direction

- Calm, text-first engineering notebook.
- Clear hierarchy, readable spacing, restrained color.
- Practical and senior, not flashy or portfolio-effect heavy.

## UI Rules

- Keep sections unframed unless a component is a repeated card, empty state, form frame, or article item.
- Use cards sparingly and keep border radius at `8px`.
- Keep text readable on mobile and desktop.
- Avoid decorative gradient blobs, excessive animation, and heavy JavaScript interactions.
- Preserve accessible labels, headings, focus states, and semantic HTML.

## Styling

- Global styles live in `src/styles/global.css`.
- Use existing CSS variables before introducing new colors.
- Keep the palette balanced; avoid turning the whole site into a single hue theme.
- Ensure new controls have visible focus states.

## Visual Verification

For layout-heavy changes, run `npm run build` and inspect with `npm run dev` or `npm run preview`.
Check at least one mobile-width and one desktop-width viewport.
