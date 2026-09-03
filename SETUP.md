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

The extension captures Google Meet's live captions and, alongside them, one
mixed audio recording of the call. It is Chrome-only (MV3,
`externally_connectable`, `tabCapture`, offscreen documents).

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

**Pin the extension to the toolbar** (puzzle-piece menu → pin "Verbatim
Capture"). Audio recording depends on clicking that icon: see below.

## What to click through, part two

1. With the website running, open **Extension** in the sidebar
   (`/extension/connect`). It hands the extension a Convex Auth token and
   should say "Extension connected".
2. Join a Google Meet call and turn captions on with the **CC** button. The
   extension reads the caption panel; it does not do its own speech recognition.
   A small "Verbatim" panel appears bottom-right.
3. In that panel, click **Enable microphone** and allow the prompt in the tab
   that opens. This is a one-time grant to the extension's own origin. It is a
   separate page because Chrome does not show microphone prompts in offscreen
   documents. The recorder runs there, so without the grant the recording
   contains the other participant but not you.
4. **Click the Verbatim toolbar icon once, in the Meet tab.** Chrome only
   allows tab capture on a tab where the user has invoked the extension
   itself, and a click inside the injected panel does not count. The panel
   changes from "Click the Verbatim toolbar icon once to allow audio
   recording" to "Audio ready for the next lesson".
5. Click **Start lesson**, talk, then **Stop lesson**. While recording, the
   panel should say "Audio: this call and your microphone" and the toolbar icon
   carries a red **REC** badge. **You should still hear the call normally.** Tab
   capture mutes the tab, and the extension routes the captured audio back to
   your speakers. If the call goes silent when you press Start, that routing is
   broken; say so.
6. Check the result with `bunx convex data lessonSessions` and
   `bunx convex data transcriptLines` from `packages/convex`, or in
   `bunx convex dashboard`. A finished lesson has `status: "ready"`, an
   `audioStorageId`, an `audioDurationMs` close to how long you talked, and a
   small `audioOffsetMs`.

If you forget step 4 and start anyway, the lesson still captures captions and
says "No audio: click the Verbatim toolbar icon to start recording this
call". Clicking the icon then starts the recording mid-lesson; the stored
`audioOffsetMs` accounts for the late start. A lesson that ends with no
recording at all is closed as `"incomplete"` rather than `"ready"`.

The token lasts **one hour**. After that the panel says the sign-in expired
and its button reopens `/extension/connect`; captured lines stay queued in
the meantime and upload once you reconnect.

## Notes for later phases

- `annotations` and `reviewCards` are defined in
  `packages/convex/convex/schema.ts` but have no functions yet. That is
  intentional scope, not an oversight. `transcriptLines` gained
  `transcriptLines.append` in Phase 1a.
- Timestamps: `transcriptLines.startMs`/`endMs` and the recording share one
  origin, the instant the service worker starts the lesson. The recording
  itself begins a little later, and `lessonSessions.audioOffsetMs` is that
  gap. To seek the audio to a line, use `startMs - audioOffsetMs`. On this
  machine the gap measured ~10 ms with a stubbed recorder; in a real browser
  expect more, and much more when the tab is armed mid-lesson, so read the
  stored value rather than assuming it is small.
- Audio is buffered in the offscreen document for the whole lesson and
  uploaded once on Stop (32 kbps Opus, about 14 MB an hour). If the upload
  fails, the recording is kept and the panel offers **Retry saving audio**;
  the session sits in `"processing"` until it lands.
- The recording is WebM/Opus written by `MediaRecorder`, whose container
  carries no duration in its header. A player asked to seek it may report an
  infinite duration until it has read the whole file; Phase 2 should seek
  using `audioDurationMs` from the session row rather than the file's own
  metadata.
- `externally_connectable` in `apps/extension/wxt.config.ts` lists
  `http://localhost/*` only. A production origin has to be added there, and
  the extension rebuilt and reloaded, before this works off localhost.
- `lessonSessions.startSession` (in `packages/convex/convex/lessonSessions.ts`)
  is the consent-enforcement mutation. It refuses to create a session unless
  both paired users' *current* standing consent is true, read fresh at call
  time rather than passed in by the client. The extension's "Start lesson"
  button calls it, so a lesson cannot begin without live consent from both
  sides.
