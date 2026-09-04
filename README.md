# Verbatim

Transcript + per-sentence audio review for English-tutoring lessons held
over Google Meet. Extension captures captions and audio during the call;
the website is where transcript review, annotation, and study happen.

Architecture, data model, and phased roadmap: see
`notes/verbatim/spec.md` in the captain repo.

## Repo layout

```
apps/
  web/          # Next.js site (App Router)
  extension/    # Chrome MV3 extension that captures Google Meet captions
packages/
  ui/           # Shared UI components
  convex/       # Convex schema and functions for apps/web
infra/
  openpronounce/  # Deployment descriptor for the self-hosted scoring worker
```

First time here? See `SETUP.md` for the one-time Convex + Google OAuth
provisioning steps, then `bun install && bun run dev`.
