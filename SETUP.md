# Setup

Everything in this repo is written and typechecked as if a Convex deployment
and Google OAuth client already exist. Both require interactive steps only a
human can do (browser OAuth login, Google Cloud Console). This is the
one-time checklist to go from a fresh clone to a working dev server.

## 1. Install dependencies

```sh
bun install
```

## 2. Provision the Convex deployment

The Convex project lives in `packages/convex`, not the repo root. This
monorepo has multiple packages, and Convex needs to know which folder's
`convex/` directory to use.

```sh
cd packages/convex
bunx convex dev
```

This opens a browser for one-time login/signup, lets you create (or pick) a
Convex project, and then:

- writes `packages/convex/.env.local` with `CONVEX_DEPLOYMENT` and
  `CONVEX_URL`
- generates `packages/convex/convex/_generated/*` (the typed `api`,
  `dataModel`, and `server` modules imported by this repo). Nothing will
  typecheck or run against the real schema until these files exist
- pushes `convex/schema.ts` and the functions in `convex/*.ts` to the
  deployment
- keeps watching for changes (leave it running in a terminal)

Copy the deployment URL it prints. It looks like
`https://something-123.convex.cloud` and is needed in step 5.

## 3. Create the Google OAuth client

Every user already has a Google account for Google Meet lessons, so Google is
the only sign-in method. No password auth is required.

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   pick) a project, then **APIs & Services → Credentials → Create
   Credentials → OAuth client ID → Web application**.
2. Under **Authorized redirect URIs**, add:

   ```
   https://<your-deployment>.convex.site/api/auth/callback/google
   ```

   Use the *HTTP Actions URL* for your deployment. It has the same subdomain
   as the `.convex.cloud` URL from step 2, but uses `.convex.site`. Find it on
   the deployment's Settings page in the Convex dashboard, or with
   `bunx convex env list`. Do **not** use the `.convex.cloud` URL here.
   Convex Auth's callback is served from `.convex.site`.
3. Copy the generated **Client ID** and **Client secret**.

## 4. Wire the credentials into Convex

Run these from `packages/convex` (where `bunx convex dev` configured the
deployment):

```sh
bunx convex env set AUTH_GOOGLE_ID <client-id-from-step-3>
bunx convex env set AUTH_GOOGLE_SECRET <client-secret-from-step-3>
bunx convex env set SITE_URL http://localhost:3000
```

`SITE_URL` is the URL that Convex Auth's default redirect callback validates
against `redirectTo`. Without it, sign-in will fail with a redirect error.
Update it to your production URL when you deploy.

## 5. Point the website at the deployment

Create `apps/web/.env.local`:

```sh
NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
```

Use the `.convex.cloud` URL from step 2, not the `.convex.site` URL used for
the OAuth redirect.

## 6. Run it

```sh
# From the repo root, run `convex dev` and `next dev` together.
bun run dev
```

Or in two terminals if you'd rather see their output separately:

```sh
cd packages/convex && bunx convex dev
cd apps/web && bun run dev
```

Open `http://localhost:3000`.

## What to click through

1. Sign in with Google.
2. Pick "tutor" or "student". This choice cannot be changed later.
3. Pairing: generate an invite code as the first user; sign in as the other
   role in a different browser/profile (or incognito) and redeem it.
4. Land on the empty dashboard ("no lessons yet").
5. Visit Settings and toggle "consent to being recorded during lessons" for
   each paired user. Phase 1's recording flow will read this setting.

## 7. Load the capture extension

The extension captures Google Meet's live captions and uploads them as a
transcript. It is Chrome-only (MV3, `externally_connectable`).

It is built with [WXT](https://wxt.dev), which owns the manifest. There is no
`manifest.json` in the source tree, only `apps/extension/wxt.config.ts`.

```sh
cd apps/extension
bun run build      # or `bun run dev` for WXT's dev server + auto-reload
```

Then in Chrome: **chrome://extensions → Developer mode → Load unpacked →
`apps/extension/.output/chrome-mv3`**.

If Meet's Content-Security-Policy interferes with the dev server's reload
client, use `bun run build` and hit reload in `chrome://extensions` instead.

The extension's ID is pinned to `lekedgolgpdocenlpjgmmcbmgphjmjje` by the
`key` in `apps/extension/wxt.config.ts`, so it is the same on every machine
and the website knows where to send the auth token. Confirm Chrome shows that
ID; if it doesn't, the website's handoff will silently fail.

The build reads the deployment URL from `packages/convex/.env.local`, so
there is nothing else to configure. Override it with `WXT_CONVEX_URL` (and
the site origin with `WXT_WEB_ORIGIN`) in the environment if you need to
point somewhere else.

## What to click through, part two

1. With the website running, open **Extension** in the sidebar
   (`/extension/connect`). It hands the extension a Convex Auth token and
   should say "Extension connected".
2. Join a Google Meet call and turn captions on with the **CC** button. The
   extension reads the caption panel; it does not do its own speech recognition.
3. A small "Verbatim" panel appears bottom-right. Click **Start lesson**,
   talk, then **Stop lesson**.
4. Check the result with `bunx convex data transcriptLines` from
   `packages/convex`, or in `bunx convex dashboard`.

The token lasts **one hour**. After that the panel says the sign-in expired
and its button reopens `/extension/connect`; captured lines stay queued in
the meantime and upload once you reconnect.

## Notes for later phases

- `annotations` and `reviewCards` are defined in
  `packages/convex/convex/schema.ts` but have no functions yet. That is
  intentional scope, not an oversight. `transcriptLines` gained
  `transcriptLines.append` in Phase 1a.
- A lesson stopped by the extension lands in status `"processing"`, not
  `"ready"`: there is no audio yet. Phase 1b attaches the recording and moves
  it to `"ready"`.
- `externally_connectable` in `apps/extension/wxt.config.ts` lists
  `http://localhost/*` only. A production origin has to be added there, and
  the extension rebuilt and reloaded, before this works off localhost.
- `lessonSessions.startSession` (in `packages/convex/convex/lessonSessions.ts`)
  is the consent-enforcement mutation. It refuses to create a session unless
  both paired users' *current* standing consent is true, read fresh at call
  time rather than passed in by the client. The extension's "Start lesson"
  button calls it, so a lesson cannot begin without live consent from both
  sides.
