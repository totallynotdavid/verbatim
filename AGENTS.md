# AGENTS.md

Read [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md)
first.

- Serve lesson and retry audio only through `/lessonAudio` and `/retryAudio`.
  Never call `ctx.storage.getUrl` for them.
- Resolve the caller with a helper from `model/sessions.ts` before a Convex
  function reads or writes lesson data.
- Authorize each worker HTTP route with `authorizeRun`, using a purpose of its
  own.
- Create review cards only through `createForAnnotation`.
- Write an `annotations` row with `source: "auto"` only from
  `scoring.confirmSuggestion`. Model output goes to `pronunciationSuggestions`.
- Never update a `transcriptLines` row's `text` or `order`.
- Send only retry takes to OpenPronounce, never a lesson recording.
- Keep `ConvexAuthNextjsServerProvider` in `apps/web/src/app/layout.tsx`.
- Do not edit `packages/convex/convex/_generated` by hand. `convex dev` and
  `convex codegen` write it.
- Change the matching page in `docs/` in the same change as the behaviour it
  describes.
- Format Markdown with
  `bunx prettier --print-width 80 --prose-wrap always --write '**/*.md'`.
- Run `bun run typecheck` before you finish.
