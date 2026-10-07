# Contributing

## Set up

Follow [SETUP.md](SETUP.md) to install dependencies, create a Convex deployment
and run the site. Read [ARCHITECTURE.md](ARCHITECTURE.md) for the layout.

`bun run dev` runs `convex dev`, `next dev` and `wxt` together through
Turborepo. `convex dev` also writes `packages/convex/convex/_generated`, which
the web app and extension import. Git ignores that directory.

## Check your change

From the repository root:

```sh
bun run typecheck   # tsc in every package, and `wxt prepare` for the extension
bun run build       # next build and wxt build
```

Both need `packages/convex/convex/_generated`. On a fresh clone it does not
exist, and they fail with `Cannot find module './_generated/dataModel'`. Write
it first with `bunx convex dev --once`, or with `bunx convex codegen` once a
deployment is configured ([SETUP.md](SETUP.md#2-create-the-convex-deployment)):

```sh
cd packages/convex
bunx convex dev --once
```

The extension build writes `apps/extension/.output/chrome-mv3`, which you can
load unpacked in Chrome. See [SETUP.md](SETUP.md#7-load-the-extension).

The repository has no test suite and no linter script. `bun run lint` runs
nothing, because no package defines a `lint` task.

## Format documentation

Markdown is formatted with Prettier, which is not a dependency and has no config
file:

```sh
bunx prettier --print-width 80 --prose-wrap always --write '**/*.md'
```

## Where changes go

- A new Convex table goes in [`schema.ts`](packages/convex/convex/schema.ts),
  with the index each query needs.
- A rule that two modules share goes in `packages/convex/convex/model/`.
- A function that reads or writes a lesson resolves the caller with a helper
  from `model/sessions.ts` before it touches data. See
  [docs/auth.md](docs/auth.md#who-can-read-and-write-what).
- Change the doc page for a workflow in the same change as the workflow. Pages
  are listed in [docs/README.md](docs/README.md).
- Agents working in the repository read [AGENTS.md](AGENTS.md).
