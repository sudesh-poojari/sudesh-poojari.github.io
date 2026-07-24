# Content Guide

## Current Content State

- Articles are intentionally in Coming Soon mode.
- `src/content/articles/coming-soon.md` is a draft placeholder so the collection exists.
- Do not publish sample articles without confirmation.
- Playbooks are intentionally removed.

## Article Rules

Use Markdown or MDX in `src/content/articles`.

Frontmatter:

```yaml
---
title: "Article Title"
description: "Short summary for SEO and listing pages."
publishedAt: 2026-07-24
tags: ["React", "TypeScript"]
draft: true
---
```

Set `draft: false` only when the user confirms publication.

## NDA-Safe Writing

Before publishing, remove or generalize:

- Employer names.
- Product or project names.
- Internal metrics.
- Customer details.
- Incident labels.
- Screenshots, logs, dashboards, tickets, or architecture docs.
- Roadmap details or proprietary implementation specifics.

Prefer generic phrasing such as “In large React applications...” over company-specific stories.
