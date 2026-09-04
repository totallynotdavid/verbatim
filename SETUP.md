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

## What to click through, part three: the review UI

Phase 2 turns `/dashboard` into a list of past lessons and adds
`/dashboard/sessions/<id>`, the review screen. Nothing here needs the
extension.

1. Open **Dashboard**. Each lesson shows its date, length, whether it has
   audio, how many notes it carries, and its status badge.
2. Open one. The transcript fills the main pane as a speaker-grouped
   conversation; audio controls and the notes for the selected line sit in
   the side panel; a **Transcript / Notes** tab pair sits under the header.
3. **Click a line.** It highlights, the recording seeks to it, and playback
   stops on its own at the end of the clip.
4. **Prev / Next** walk the transcript utterance by utterance. So do the
   arrow keys (and `j`/`k`); `space` replays the current line. Typing in a
   note is not interrupted by any of them.
5. **Select words inside a line** and a note composer opens anchored to the
   selection. Pick one of the six types, write the note, save. The words get
   an underline in the type's colour and the note appears under the line.
6. The **note** button on a line attaches a note to the whole line instead.
7. Your own notes carry edit and delete; your partner's are read-only. Both
   of you see both sets, live — Convex pushes the update without a refresh.

### Seeding a lesson to click through

There is no display on the build machine, so the review UI was verified
headlessly and the deployment was seeded with one full lesson to look at:
24 lines of a tutor/student conversation that turns into a mock interview,
nine notes (five anchored to word ranges, one written by the student), and a
128-second recording whose audio is **one distinct tone per transcript
line**. That last part is the point: clicking line *n* should play tone *n*
and stop, so a wrong seek or a wrong `audioOffsetMs` sign is something you
hear rather than something you have to reason about.

The seeding scripts are not in the repo — they were throwaway, and they
drive the ordinary Phase 1 mutations (`startSession`, `transcriptLines.append`,
`finishCapture`, `generateAudioUploadUrl`, `attachAudio`) rather than writing
rows behind the pipeline's back. A real Meet call produces the same shape.

## Serving lesson audio: an authenticated route, not a storage link

`ctx.storage.getUrl()` is the obvious way to hand a file to a browser, and it
is wrong for this one. Those URLs are permanent, cannot be revoked without
deleting the file, and work for anyone who ends up holding one — a copied
link, a browser history sync, a screenshot of devtools. A recording of two
people talking, in a product whose first-class requirement is that both of
them consented to being recorded, should not be protected by the secrecy of a
string.

So `packages/convex/convex/http.ts` serves the bytes instead:

```
GET https://<deployment>.convex.site/lessonAudio?sessionId=<id>
Authorization: Bearer <Convex Auth token>
```

The handler runs `internal.lessonSessions.audioRequestTarget`, which resolves
the caller from their token and checks them against that session's tutor and
student, then streams `ctx.storage.get()`. The check runs on **every**
request, against the caller's own short-lived token — there is no bearer link
to leak. Callers get 401 with no or a bad token, 403 when signed in but not
part of the lesson, 404 for an unknown session or one with no recording.

**R2 was the other candidate and is not needed.** The spec already names
`@get-convex/r2` as the storage escape hatch, and its presigned URLs support
HTTP Range, which is the usual reason to reach for it. But this player never
issues a Range request: it downloads the whole file once and seeks locally
against a blob URL, so Range buys nothing here. An HTTP action solves the
actual problem with no Cloudflare account, no bucket, and no credentials to
provision. Phase 1b's upload path is untouched — `audioStorageId`,
`generateAudioUploadUrl` and `attachAudio` are exactly as they were, and the
extension needed no change.

**The client sends the token with `useAuthToken()`** from
`@convex-dev/auth/react`, which is Convex Auth's documented way to
authenticate an HTTP action. Phase 1a found that hook returning `null`, so it
was re-checked here rather than assumed: it returns `null` under
`ConvexAuthNextjsProvider` *alone*, because that component renders only
`ConvexProviderWithAuth` and never the token context. This app is fine,
because `apps/web/src/app/layout.tsx` also wraps everything in
`ConvexAuthNextjsServerProvider`, whose client half is what provides the
token. Keep that wrapper — removing it silently breaks audio playback (and,
in fact, the whole auth context).

The token rotates about once an hour. `use-clip-player.ts` keeps it in a ref
and keys its download effect on *whether* a token exists rather than on its
value, so a rotation does not re-download the recording or interrupt
playback.

**Known ceiling: 20MB.** Convex caps an HTTP action's response at 20MB.
Phase 1b measured lesson audio at roughly 14MB an hour at 32 kbps Opus, so
this route tops out around 85 minutes of recording — comfortably past a
normal lesson, and nothing to design around now. When a lesson does outgrow
it, the options are chunked delivery (a Range-aware route, at which point the
player's download-once design would need to change too) or moving bytes to
the `@get-convex/r2` component named in the spec. It sits in the same
category as the storage-quota escape hatch already documented there.

**Any `getUrl` link handed out before this change is still live.** That is
the property being fixed, and it is not retroactive: an already-issued
storage URL cannot be revoked, only outlived by deleting and re-uploading the
file. Nothing in the codebase mints them any longer.

## Per-sentence playback: what was decided and why

**One fetch per session, not per click.** `lessonSessions.getReview` returns
a URL for the `/lessonAudio` HTTP action alongside the transcript. The page
downloads that file once into a blob and plays every clip out of the blob, so
walking a transcript does not put a request on the wire per line. See
"Serving lesson audio" below for why that is an HTTP action rather than a
storage link.

**Padding: 250 ms each side.** Meet stamps a caption row when its text
settles, not when the words start, so `startMs` is late and `endMs` can land
before a final consonant has finished. 250 ms is roughly a syllable at
conversational speed — enough to keep word onsets and endings (the `-ed` in
"asked", the `th` in "month") inside the clip, and still under the ~200-300 ms
gap that separates conversational turns, so the next utterance does not bleed
in. It is `CLIP_PADDING_MS` in `apps/web/src/lib/clip.ts`.

**Stopping at the end of a clip: `timeupdate` *and* `requestAnimationFrame`,
not `setTimeout`.** Per MDN, `timeupdate` fires somewhere between 4 Hz and
66 Hz depending on system load, so on its own it can overrun a clip by a
quarter of a second — but it is driven by the media pipeline and keeps firing
in a backgrounded tab. A `requestAnimationFrame` loop is accurate to about a
frame but is suspended when the tab is hidden. Each covers the other's blind
spot, so the player runs both and whichever notices first pauses. A
`setTimeout` sized to the clip is the weakest of the three and is not used: it
keeps counting while the element stalls or buffers, and a background tab
clamps timers — Firefox to 1 s (it only exempts tabs holding an
`AudioContext`, which a plain `<audio>` element is not), Chrome to once a
second unless the tab is making sound.

**Duration comes from the session row.** `MediaRecorder`'s WebM carries no
duration element, so `audio.duration` can be `Infinity` and the browser may
refuse to seek until it has scanned the file. Every clip calculation uses
`lessonSessions.audioDurationMs` instead. On top of that, when metadata loads
with a non-finite duration the player seeks once far past the end to force
that scan, then returns to zero — the standard workaround, applied only when
it is needed and behind a 3-second timeout.

**Lines outside the recording say so.** If the tab was armed for capture
partway through the lesson, `audioOffsetMs` is large and the earlier lines
have no audio behind them. Those lines render "no audio" rather than playing
whatever happens to sit at second zero.

## What this phase could not verify without a browser

Everything below was checked headlessly against the real deployment, with
authenticated calls and server-rendered components:

- The Convex functions: 50 assertions covering the list and review queries,
  annotation create/update/delete, both ownership directions, and every
  validation path.
- The `/lessonAudio` route: 25 assertions against the real deployment with
  real signed tokens — the session's tutor and student each get the bytes;
  no token, a malformed one, an expired one, and one minted for a different
  issuer each get 401; a signed-in non-participant gets 403; a missing,
  malformed or recording-less session id gets 400/404 rather than a crash;
  and the CORS preflight allows the `Authorization` header from this site's
  origin.
- `useAuthToken()`: rendered through this app's real provider chain and
  confirmed to return the session token (and confirmed to supply nothing
  without `ConvexAuthNextjsServerProvider` above it).
- The playback and annotation maths (`clip.ts`, `text-range.ts`): 29
  assertions on padding, offset, clamping, word-range trimming and the
  highlight splitting.
- The components: rendered with `react-dom/server` against real query
  output, 21 assertions on speaker grouping, word-range underlines, the
  audio panel's five states and the composer.

None of that is a substitute for a person in a browser, and this phase needs
more of that than Phase 1 did. Still unverified:

- **That a clip actually sounds right.** Seeking, the stop landing where it
  should, and the padding being the right size are audible properties. The
  seeded lesson's one-tone-per-line recording is there to make this quick to
  judge.
- **Real WebM/Opus.** The seeded recording is WAV, because the build machine
  has no encoder. The `Infinity`-duration workaround above is therefore
  untested against the file format it exists for — it is the documented
  behaviour and the standard fix, not something confirmed here. Phase 1's
  earlier uploads are stub bytes labelled `audio/webm`, not decodable audio,
  so they will not exercise it either. **The first real Meet recording is the
  test.** If a clip refuses to play or seeks to the wrong place on a genuine
  extension capture, that workaround is the first thing to look at.
- **The authenticated download from a real signed-in browser.** The route and
  the hook were each verified on their own, but not joined up: a forged auth
  cookie gets past the middleware and then gets cleared, because a real
  session also needs the refresh-token cookie that only the Google sign-in
  flow can mint. What is untested is the last hop — a real browser attaching
  a real token, and the CORS preflight actually being sent and accepted. If
  audio fails to load after sign-in, the network tab's `OPTIONS /lessonAudio`
  and the `SITE_URL` Convex env var are the first two things to check.
- **Text selection.** `selectionOffsetsWithin` walks the DOM via a `Range`;
  its inputs are tested but the browser half is not. Double-click, drag, and
  drag across two lines (which should be refused) all need trying.
- **Scrolling and the jump pill**, the popover's placement and collision
  handling, focus order, and how the two-pane layout collapses on a phone.
- **Dark mode**, which nothing here rendered.

## Design tokens: the Phase 0 port still matches

The brief asked whether reloop's `packages/tailwind/style.css` had drifted
from the copy in `packages/ui/src/globals.css`. It has not: of 550 custom
properties present in both, 549 have identical values, and the one difference
is cosmetic — reloop defines `--overlay` as `var(--overlay-gray)` while the
port inlines the same `#3333333d` / `#3333338f`. The 87 properties reloop has
and this repo does not are all specific to reloop's own product (its mail
client, social-provider brand colours, the `slate` ramp, `zero-blue`, the
fancy-button shadows, the `doc-*` typography scale). Nothing this phase
needed was missing.

## Notes for later phases

- `reviewCards` is defined in `packages/convex/convex/schema.ts` but has no
  functions yet. That is intentional scope, not an oversight: Phase 3 owns
  turning annotations into review cards. `transcriptLines` gained
  `transcriptLines.append` in Phase 1a; `annotations` gained `create`,
  `update` and `remove` in Phase 2.
- Phase 2 added two optional fields to `annotations`: `charStart` and
  `charEnd`, a character range within the line's raw text, for a note about
  one word rather than the whole utterance. They are optional, so the
  addition needed no migration. Ranges are safe to store because a
  transcript line's ASR text is immutable once written. A range covering the
  entire line is normalised away to "no range" on the way in.
- The ownership check that Phase 1 had copied into both `lessonSessions.ts`
  and `transcriptLines.ts` now lives once in
  `packages/convex/convex/model/sessions.ts`, since the annotation functions
  would have been a third copy.
- Nothing calls `ctx.storage.getUrl` any more. Lesson audio is served by the
  authenticated `/lessonAudio` HTTP action in `packages/convex/convex/http.ts`
  (see "Serving lesson audio" above), which re-checks the caller against the
  session on every request. If a future feature needs to hand a file to a
  browser, that route is the pattern to copy, not `getUrl`.
- `SITE_URL` is now load-bearing twice over: Convex Auth validates sign-in
  redirects against it, and `/lessonAudio` uses it as the CORS origin. A
  deployment whose `SITE_URL` does not match the site's real origin will sign
  users in but fail to play audio.
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
