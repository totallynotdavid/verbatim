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

## What to click through, part four: the study loop

Phase 3 adds two routes and a sidebar entry each: **Review**
(`/dashboard/review`) and **Trends** (`/dashboard/trends`). Neither needs the
extension.

1. Open **Review**. It shows one card at a time: the flagged transcript line
   (with the underlined word range, if the note had one), the note itself, the
   original clip on the left, and your own retry on the right.
2. **Play original.** The card's clip comes out of *that lesson's* recording,
   with the same 250 ms padding as the transcript viewer. `space` replays it.
3. **Record a retry** — on a **pronunciation** or **filler** card; the other
   four types show the original clip full width and no recorder (see below).
   The browser asks for the microphone the first time — this is the
   *website's* permission prompt, nothing to do with the extension's. Say the
   sentence, press **Stop**, listen to the take in the preview player, then
   **Keep this take** or **Discard**.
4. A kept take is listed under **Your retry**. Click `take 1` to hear it; click
   the original again to compare. Only whoever recorded a take can delete it —
   your partner can hear it but not remove it.
5. **Grade the card**: Again / Hard / Good / Easy, or the keys `1`–`4`. The
   card disappears from today's queue and comes back on the schedule the
   algorithm picks. The header counts down `n of m done today`.
6. When the queue empties it says so and tells you when the next card is due.
7. Open **Trends**. Recurring flagged words and sounds at the top (only things
   flagged more than once), then words-per-minute and filler rate per lesson,
   then a table of every lesson with its note breakdown. Every row links back
   to the transcript it came from.

### The spaced-repetition algorithm: SM-2, unmodified

`packages/convex/convex/model/scheduling.ts` implements SM-2 as published,
checked against the reference Delphi source at
`super-memory.com/english/ol/sm2source.htm` and against the `supermemo` npm
package's TypeScript port (`VienDinhCom/supermemo`, `src/main.ts`), not against
a summary of it:

- Intervals are 1 day, then 6 days, then `round(interval * ease)`.
- Ease starts at 2.5, moves by `0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)`
  after **every** review, and is floored at 1.3.
- A grade below 3 restarts the sequence: interval back to 1 day, repetition
  count back to zero.

The only thing this repo adds is turning an interval in days into an absolute
`dueAt`, because cards are stored with a due date rather than a "days since
last seen" counter.

**Four buttons, not a 0-5 self-rating.** SM-2's input is a six-point scale that
nobody can apply honestly to their own pronunciation. The UI uses Anki's
collapse — one failing button, three passing ones — mapped to grades 2, 3, 4
and 5. **Again is 2 rather than 0** on purpose: 2 is still inside SM-2's
failure band, so the card restarts either way, but it costs 0.32 of ease
instead of 0.8. A student who cannot yet produce a sound their tutor only just
flagged is the expected case, not a memory blackout, and two blackouts would
otherwise pin a card at the 1.3 floor permanently. The mapping is one table in
`apps/web/src/lib/review-grades.ts`.

**A failed card comes back tomorrow, not in ten minutes.** SM-2 has no
intra-day learning steps and none were invented here. If same-session re-drills
turn out to matter, that is a deliberate departure from the algorithm to make
later, not something to slip in now.

**One note is one card, written by one mutation.** `annotations.create` inserts
the `reviewCards` row itself, in the same transaction. There is no second call
to forget, no queue entry without a note, and no note without a queue entry.
`annotations.remove` deletes the card and every retry recorded against it,
including the stored bytes. Editing a note's text or type does *not* reschedule
its card — the thing being remembered has not changed.

**A new card is due immediately**, so a note the tutor writes during a lesson is
in the student's queue that evening.

**Schema.** `reviewCards` kept `sessionId`, `sourceAnnotationId`, `dueAt`,
`interval` and `ease`, and gained `studentId`, `repetitions`, `lapses`,
`lastReviewedAt` and `lastGrade`. `repetitions` is not optional decoration:
SM-2's ladder is driven by the consecutive-pass count, and it cannot be
recovered from the interval. The old global `dueAt` index is gone, replaced by
`studentId_dueAt` — a bare `dueAt` index would have walked every pair's cards
to find one learner's.

### Backfilling cards for notes written before Phase 3

Annotations that already existed have no card, because nothing wrote one at the
time. One internal mutation fixes that, and it is safe to run more than once:

```sh
cd packages/convex
bunx convex run reviewCards:backfill
```

It skips annotations that already have a card and reports
`{ created, skipped }`. Backfilled cards are due immediately, like a note
written today.

### Retry recordings: the website's microphone, not the extension's

This is the second real-microphone surface in the product and it has nothing in
common with the first. The extension records a Meet tab through
`chrome.tabCapture` in an offscreen document; the retry flow is
`getUserMedia({ audio: true })` plus a `MediaRecorder` in an ordinary tab
(`apps/web/src/lib/use-mic-recorder.ts`). The permission prompt is against the
website's origin, so granting it to the extension does nothing here and vice
versa.

- **Each take is its own row.** `retryRecordings` (reviewCardId, annotationId,
  storageId, recordedBy, durationMs, createdAt). Nothing is spliced into the
  lesson audio: the lesson recording stays the record of what was actually
  said, and a retry is a separate artifact next to it.
- **Duration is measured while recording**, not read back from the file, for
  the same reason `lessonSessions.audioDurationMs` exists — `MediaRecorder`
  writes WebM with no duration in its header.
- **Container is negotiated**: `audio/webm;codecs=opus` where it is supported,
  falling back through `audio/webm`, `audio/ogg;codecs=opus` and `audio/mp4`
  (Safari records MP4/AAC and supports nothing above it). A browser with no
  `MediaRecorder` at all says so instead of offering a dead button.
- **Limits**: the recorder stops itself at 60 seconds, the server refuses
  anything over 120 seconds or with a non-positive duration, and a card holds
  at most 20 takes. A take rejected by those checks has its uploaded bytes
  deleted — unless a saved retry already points at them, so a bad call cannot
  delete a recording that is in use.
- **A level meter runs while recording**, so a muted or wrong microphone is
  visible before the take is saved rather than after.

**Only pronunciation and filler notes get a recorder.** A retry is an audio
comparison of one phrase said twice, so it only says something about a
correction to *how* something was said. Grammar, word choice, interview
structure and technical content are corrections to *what* was said: the fix is
conceptual, reading the note is the work, and a microphone beside it is clutter
that adds nothing. Filler sits with pronunciation rather than with the other
four because "say that again without the ehm" is a fluency drill whose result
you can actually hear.

The rule is written twice and enforced in both places, the way consent and note
validation already are in this codebase — `supportsRetry` in
`apps/web/src/lib/annotation-types.ts` hides the recorder, and
`requireRetryableCard` in `packages/convex/convex/retryRecordings.ts` refuses
the write. The backend checks it in `generateUploadUrl`, so a refused type never
costs an upload, and again in `attach`, because an upload URL outlives the call
that minted it. (The six type values were already duplicated between the web
app and the Convex schema; this follows that seam rather than opening a new
one.)

`annotations.update` can change a note's type after the fact, so a card can end
up holding takes its current type would not allow. Those takes stay listed and
playable — deleting audio someone recorded because a label changed would be
worse than the inconsistency — but the card offers no way to add another.

### Serving retry audio: the same authenticated route, not a second pattern

Retry audio is served exactly like lesson audio:

```
GET https://<deployment>.convex.site/retryAudio?retryId=<id>
Authorization: Bearer <Convex Auth token>
```

The handler resolves the retry, then its card, then that card's lesson, and
checks the caller against the lesson's tutor and student — the same membership
rule, re-run on every request. A short personal pronunciation clip is not less
sensitive than the lesson it came from, so it does not get a weaker mechanism.
Nothing in this phase calls `ctx.storage.getUrl` either.

Three things were factored rather than copied a third time:

- `isSessionMember` in `packages/convex/convex/model/sessions.ts` is now the
  single membership rule; `requireOwnSession` uses it.
- `authorizeStoredFile` in the same file runs "resolve the caller → find the
  session that owns the bytes → check membership → read the file's content
  type", and takes a per-route `locate` callback for the one step that differs.
  Both `lessonSessions.audioRequestTarget` and
  `retryRecordings.audioRequestTarget` are now four lines each.
- `routeStoredAudio` in `packages/convex/convex/http.ts` registers the GET and
  the CORS preflight, so `/lessonAudio` and `/retryAudio` are literally the same
  code with a different id parameter.
- `requireOwnReviewCard` is the card-scoped equivalent of `requireOwnSession`:
  one extra hop, not a second rule.

### The trend view: what each number means

All read-only aggregation over transcript lines and annotations that already
exist. No new writes, no new capture.

**Words per minute** is every transcribed word over the time from the start of
the lesson to the end of the last caption — the last line's `endMs`, not
`endedAt - startedAt`. Line timestamps and the session clock share an origin,
so the last caption's end is "the time from lesson start until the last thing
anyone said". Wall-clock end includes whatever came after that — goodbyes with
the tab still open, a late Stop — which is dead air that drags the rate down
without anyone having spoken more slowly. Wall clock is the fallback only when
a lesson has no captions at all, and a lesson with no captions has no words to
rate, so in practice it never runs. Lessons with no transcript show `—` rather
than an invented number.

**Filler rate** is filler annotations per 100 transcribed words, not per
minute. It is a habit of speech: it should not look better simply because the
lesson was slow.

**Recurring flagged words and sounds** groups annotations by the text they are
about. A note anchored to a character range names its own words — that range
against the line's immutable text is exactly what the tutor underlined. A
line-level note has no range, so the note text is the fallback, and because
tutors quote the thing they mean ("The 'th' in 'month' and the '-ed' cluster in
'asked'"), quoted spans are pulled out of it: that one note contributes `th`,
`month` and `asked` rather than one unmatchable sentence. The quote has to sit
on a word boundary, so the apostrophes in "don't" and "isn't" cannot pair up
into a bogus term. A note with nothing quoted contributes its own text, which
groups repeats of the same note and nothing else. The list shows only terms
flagged more than once — a list of things that happened once is not a trend.

The whole query reads every line of every lesson. That is fine for a pair with
a lesson a week and will want a rollup long before it is not; the spec already
names scheduled functions as where that would live.

### Seeding the study loop to click through

There is still no display on the build machine, so the deployment carries
enough data to judge this phase by ear and by eye:

- The Phase 2 lesson (24 lines, 9 notes, one distinct tone per line) is still
  there, and its notes now have cards.
- **Two more lessons** were seeded through the ordinary capture mutations
  (`startSession`, `transcriptLines.append`, `finishCapture`,
  `generateAudioUploadUrl`, `attachAudio`) — a 14-line retro and a 10-line mock
  interview, 15 notes between them, each with one distinct tone per transcript
  line like Phase 2's. They deliberately re-flag things the first lesson
  flagged, so the trend view has real repeats to group: `um` ×4 across three
  lessons, then `much more fast`, `asked` and `month` ×3 each.
- **Three retry recordings** on two pronunciation cards, so the side-by-side
  comparison has something in it before you record anything.
- A few cards were graded, so the queue is not uniformly "new": one card has
  been passed twice and sits six days out, one was passed and then lapsed.

At the time of writing that leaves 19 cards due, 5 scheduled ahead, and 8 of
the 19 lessons carrying captions.

Both extra lessons are stamped with the day they were seeded, because
`startSession` timestamps a lesson when it starts and there is no backdating
path that goes through the real mutations. The words-per-minute and filler
charts therefore show several bars sharing a date label. The seeding scripts
themselves are not in the repo — throwaway, like Phase 2's.

## What to click through, part five: the interview coaching layer

Phase 4 adds one route and a sidebar entry — **Questions**
(`/dashboard/questions`) — plus a third tab on the lesson review screen.
Nothing here needs the extension, and nothing here touches a microphone.

1. Open **Questions**. This is the bank of prompts asked in the
   mock-interview half of a lesson. As the tutor you get **New question**: a
   topic (algorithms / system design / behavioural / fundamentals), a
   difficulty, the prompt as you would say it out loud, and comma-separated
   tags. As the student the same list renders read-only — the controls are
   simply absent, and the backend refuses the write regardless.
2. Each row shows how many lesson segments cite it. Deleting a question that
   a lesson still cites is refused, by name and count: untag the segment
   first. A question nothing cites deletes immediately.
3. Open a lesson and stay on **Transcript**. As the tutor, **drag across two
   or more lines** — the tutor's question and the answer that follows it.
   A bar appears under the transcript: *"n lines selected · Tag as interview
   answer"*.
4. **Tag as interview answer** opens the bank, filterable by wording, topic
   or tag. Pick one and the range is tagged. The transcript grows a chip
   where the segment starts, the lines inside it carry a warmer ring, and the
   **Interview** tab's count goes up.
5. Ranges may not overlap: one run of lines answers one question. A second
   tag that crosses an existing segment is refused rather than silently
   nested.
6. Open **Interview**. Each tagged segment shows the question, how many
   lines it covers and where it starts (click it to jump back to the
   transcript and hear the first line), and its rubric feedback.
7. **Add feedback** opens the four dimensions the brief names — answer
   structure, concise framing, trade-off discussion, technical vocabulary.
   Each takes a rating (Strong / Developing / Needs work — click the selected
   one again to clear it) and a short note. Any dimension can be left blank;
   at least one has to say something.
8. The pencil on a segment retags it against a different question; the bin
   untags it and takes its rubric with it. The student sees every tagged
   segment and all four dimensions, read-only.

### Why this is three new tables and not a sixth annotation type

`annotations.type` has had `interview-structure` and `technical` literals
since Phase 0, and reusing them for this would have been less work. It would
also have been wrong, for reasons that are structural rather than aesthetic:

- **The anchor is a different thing.** An annotation points at one
  transcript line, optionally at a character range inside it. Rubric feedback
  scores a *run* of lines — the whole answer. Pointing an annotation at a
  range would mean either a second, unrelated anchoring scheme inside the
  same table, or a convention that "the note on the first line covers the
  next twelve", which no query can enforce.
- **Four dimensions, always four.** A rubric is a fixed shape: structure,
  conciseness, trade-offs, vocabulary. Storing that as four free-form notes
  makes "did the tutor assess trade-offs?" a string search. As four named
  fields on one row, a later phase renders `structure: …, conciseness: …,
  trade-offs: …, vocabulary: …` by reading fields, not by filtering.
- **Phase 3 already warned about this.** `annotations.create` writes exactly
  one `reviewCards` row per note. A rubric item is a judgement about an
  answer, not a phrase to drill, so an annotation-shaped rubric would have
  had to teach `createForAnnotation` to say no. A separate table means the
  question never arises, and `reviewCards` stays annotation-sourced exactly
  as Phase 3 left it.

So: `interviewQuestions` (the bank), `interviewSegments` (a lesson range
tagged with a question), `interviewRubrics` (at most one row per segment,
four named dimensions). Transcript lines stay the immutable record; a segment
is an overlay pointing at them, the same way an annotation is.

### A qualitative rating, not a number

Each dimension takes `strong` / `developing` / `needs-work` and an optional
note. A 1–5 scale was the alternative and was rejected: one tutor scoring one
student has nothing to calibrate the middle of a numeric scale against,
nothing downstream aggregates it yet, and a number invites a precision the
judgement does not have. Three named levels are one click, read the same way
by both people, and still aggregate cleanly if Phase 5 ever wants to chart
them. Both halves of a dimension are optional, so a blank dimension means
"not assessed" rather than "assessed as absent".

`saveRubric` **replaces** rather than merges: the form submits all four
dimensions every time, so a dimension the tutor cleared comes back empty. A
rubric with nothing in any dimension is refused — **Remove** is how feedback
goes away, so an empty save cannot quietly delete it.

### Tutor-only writes, and where the check lives

Two different rules, deliberately:

- The question bank is content the tutor authors outside any lesson, so
  `requireTutor` in `model/sessions.ts` gates it on `role === "tutor"` — the
  same shape as the role checks `startSession` already makes.
- Segments and rubrics belong to a lesson, so they use `requireSessionTutor`:
  `requireOwnSession` (membership) narrowed to `session.tutorId`. Authority
  over *this lesson*, not a role in general. A segment is only reachable
  through its lesson, so that one check is the whole rule for it and for its
  rubric.

The client hides controls it knows will be refused; it is not what enforces
anything. Every mutation was exercised as the student and as an anonymous
caller against the real deployment, and every one refuses.

### Seeding the question bank and a segment to click through

The dev deployment carries four real questions (one behavioural, one system
design, one algorithms, one fundamentals) and one tagged segment on the
24-line seeded lesson from Phase 2 — lines 10 to 21, where David asks *"Tell
me about a challenging bug you fixed recently"* and Ana answers — with all
four rubric dimensions filled in against what she actually said. Nothing was
written behind the mutations' back: the questions went in through
`interviewQuestions.create`, the segment through `interviewSegments.create`,
the feedback through `saveRubric`, all as the tutor's real user id.

## 8. Provision the pronunciation workers

Phase 5 is the first phase that spends real money on someone else's hardware,
and the first that needs credentials nobody in this repo can create. Until the
three variables below are set, the feature is inert rather than broken: the
**Analyse this lesson** button records a run that fails immediately with the
name of the missing variable, and retry takes are simply not scored.

### 8a. A Replicate API token

Word-level transcription runs on [Replicate's public WhisperX
model](https://replicate.com/victor-upmeet/whisperx), version-pinned in
`packages/convex/convex/model/scoring.ts`. Nothing is deployed there; the
version is public and run on demand.

1. Sign up at [replicate.com](https://replicate.com) and add a billing method.
   There is no free tier for GPU predictions.
2. **Account settings → API tokens → Create token.**
3. ```sh
   cd packages/convex
   bunx convex env set REPLICATE_API_TOKEN r8_...
   ```

**What a pass costs.** The pinned version runs on an Nvidia A40, billed by the
second while the prediction is alive. WhisperX transcribes at roughly 70×
real time, so a 45-minute lesson is a couple of minutes of GPU including
container start, which lands in the region of **$0.10–$0.35 per lesson**.
Treat that as an order of magnitude, not a quote: Replicate's public pricing
page no longer lists an A40 line at all (it lists T4, L40S, H100, A100 and
CPU), so the rate this model bills at is not something this repo can read off
a page. Run one lesson and look at the invoice before running twenty.

The submitting action sends `Cancel-After: 15m`, so a wedged prediction stops
billing on Replicate's side even if this deployment never hears from it.

### 8b. A deployed OpenPronounce

Phoneme-level scoring calls a self-hosted
[OpenPronounce](https://github.com/Halleck45/OpenPronounce) (MIT, CPU-only).
There is no hosted instance of it anywhere, so this is a container you deploy
once. `infra/openpronounce/` has the deployment descriptor and the full
walkthrough; the short version is Modal, because OpenPronounce ships no
authentication of its own and Modal's proxy auth supplies it without a proxy
of ours:

```sh
git clone --depth 1 --branch v0.3.0 https://github.com/Halleck45/OpenPronounce.git
cp infra/openpronounce/modal_app.py OpenPronounce/
cd OpenPronounce && modal deploy modal_app.py
```

Then, from `packages/convex`:

```sh
bunx convex env set OPENPRONOUNCE_URL https://<workspace>--verbatim-openpronounce.modal.run
bunx convex env set OPENPRONOUNCE_KEY   <proxy token id>
bunx convex env set OPENPRONOUNCE_SECRET <proxy token secret>
```

`OPENPRONOUNCE_URL` is the feature switch. Unset, `retryScoring.score` returns
without doing anything and no score row is written — which is the correct
resting state for a deployment that has not provisioned a worker, and is
verified as such.

Cost here is CPU seconds on a container that scales to zero: a lesson's worth
of retry takes is a fraction of a cent. The GPU half is the expensive half.

### 8c. The callback shared secret

```sh
bunx convex env set SCORING_CALLBACK_SECRET "$(openssl rand -hex 32)"
```

This one is generated, not obtained. Both worker-facing HTTP routes refuse
every request with 503 until it is set. See "The callback is a new auth
surface" below for what it actually protects and why the secret itself never
leaves the deployment.

## What to click through, part six: the automated pass

1. Open a `ready` lesson with a recording, as the **tutor**. There is a fourth
   tab, **Suggestions**.
2. Press **Analyse this lesson**. The run card moves through *Starting…* →
   *Listening to the recording…* → *Reading the transcript…* and lands on
   *Finished* with a count of what it proposed out of how many words it heard.
   A pass over a lesson-length file takes a couple of minutes; the page is
   live, so leave it and come back.
3. Each proposal is a card: the word in quotes, a draft note, how clearly the
   model could place that word, and the transcript line it came from. **Confirm
   as a note** writes it as it stands; **Edit first** opens the ordinary note
   composer with the draft filled in, so you can rewrite the wording and change
   the type before it becomes a note; **Dismiss** answers it without writing
   anything.
4. Go back to **Transcript**. Words still waiting on you carry a **dashed grey
   underline**, next to the solid coloured underlines of real notes, and the
   line's footer says how many are waiting. Confirm one and the dashes turn
   into a note's own colour.
5. Sign in as the **student** and open the same lesson. The Suggestions tab
   tells them their tutor reviews this first, and shows nothing else. Confirmed
   notes are on the Transcript tab like any other, marked **Confirmed** — a
   note a machine proposed and a person accepted, which is not the same thing
   as one the tutor sat down and wrote.
6. Open the study queue. The confirmed note is there, once. Nothing that was
   only ever a suggestion is.

For the phoneme half: grade a pronunciation or filler card, record a retry,
and keep the take. A few seconds later the take grows a score out of 100, what
the recognizer actually heard, and the words whose sounds went wrong in IPA —
`hello: /həloʊ/ → /hɛlnoʊ/ 83%`. Nothing there is editable, and nothing there
feeds the SM-2 grade; the grade is still the student's own answer to "how did
that go".

## When the automated pass runs, and why it is a button

**Tutor-triggered, from the review page.** Not automatic on every lesson that
reaches `ready`.

The argument for automatic is latency: the tutor opens a lesson and the
suggestions are already there. The argument against it is that every pass is a
real charge on someone's card for a lesson that may never be reviewed, and
that the output is useless without a tutor anyway — a suggestion nobody
confirms is not feedback, it is a row. Automatic would spend on every lesson
to save a wait on the ones that get opened.

The button also gives the tutor the one control that matters here, which is
*whether the thing runs at all*. That is worth more than two minutes, and it
is not reversible in the other direction: a deployment that spent money by
default and let you turn it off has already spent it.

If a later phase wants it automatic, the seam is one line in
`lessonSessions.attachAudio` — schedule `internal.scoring.submitWhisperx`
after a run row is inserted, exactly as `scoring.start` does. Make it a
per-pair setting rather than a global one if you do.

Retry takes are the opposite call: **scored automatically, on save**. That
half is CPU seconds on a scale-to-zero container, so there is nothing to
ration, and the moment a student saves a take is the moment they want to know
how it went.

## Draft annotations: a separate table, not a flag on `annotations`

Nothing a model produces is written to `annotations`. WhisperX output lands in
`pronunciationSuggestions` with `status: "pending"`, and `annotations` gains a
row only when `scoring.confirmSuggestion` runs, which is tutor-only and
promotes by **copying**:

- The suggestion stays, marked `confirmed`, as the record that a machine
  proposed it and who accepted it.
- The note it produces carries `source: "auto"`, so a confirmed suggestion
  never reads as something the tutor sat down and wrote. Notes written by hand
  carry `source: "tutor"`; notes from before Phase 5 carry nothing and read as
  `"tutor"`, so the field needed no migration.
- The review card is created *there*, by the same `createForAnnotation` the
  tutor's own notes use. That is what keeps drafts out of the study queue and
  out of the trends view without either of them knowing this phase exists:
  both read `annotations`, and a draft is not one.

A dismissal is kept rather than deleted, and a second pass over the same
lesson proposes nothing that already has a suggestion or a note on the same
span — so re-running is cheap in a tutor's attention as well as being
idempotent. It is not free in money; the GPU runs again.

There is deliberately **no UI for editing the model's own numbers**. A tutor
reads the draft and answers it. The confidence is shown because it helps them
decide, not because it is theirs to adjust.

## The callback is a new auth surface

Every authorization in this codebase until now has answered "which paired user
is this". Replicate's GPU is not a paired user, holds no Convex Auth JWT, and —
this is the part that shapes the design — **cannot send a header of your
choosing on a webhook**. Whatever authorizes it has to travel in the URL.

Putting `SCORING_CALLBACK_SECRET` itself in a URL held by a third party is not
something to do, so the routes carry a **per-run token derived from it**:

```
token = HMAC-SHA256(SCORING_CALLBACK_SECRET, "<purpose>:<runId>")
```

with `purpose` being `callback` or `audio`. That gives four properties worth
having:

- The secret never leaves this deployment. Replicate holds two derived strings.
- A token is worth nothing for any other run — a leaked one buys you one
  finished lesson, not the pipeline.
- The two routes are separated: the URL Replicate is given to *fetch the audio*
  is rejected on the route that *posts a result*, and vice versa. Both were
  verified.
- Rotating the secret invalidates every token still outstanding. In-flight runs
  will expire rather than land; that is the intended cost of a rotation.

The check runs before the body is read and before any row is looked up:
`authorizeRun` in `packages/convex/convex/http.ts` answers 503 when the secret
is unset, 401 for a missing or wrong token, and only then goes near the
database. None of this touches the helpers in `model/sessions.ts`, which
answer a question that has no meaning here.

Replicate retries a webhook it could not deliver, and the expiry timer fires
regardless, so more than one thing will try to finish any given run. Every
terminal path is therefore idempotent: `patchRun` refuses to move a run that
has already finished, `acceptResult` recognises a repeat delivery and deletes
the bytes it was handed, and the route answers 200 for a duplicate so Replicate
stops trying.

### Feeding the recording to a GPU without a storage link

WhisperX needs a URL — Replicate asks for URLs above 256 KB, and a lesson is
megabytes. `ctx.storage.getUrl()` was abandoned in Phase 3 for reasons that
have not changed, so `/scoring/audio` serves the bytes instead, under the same
run token, and **only while its run is active**. When the run reaches a
terminal state the URL stops working — verified in both directions.

Convex caps an HTTP action response at 20 MiB, which at the extension's 32 kbps
is a little over 90 minutes of lesson. A longer lesson than that cannot be
analysed as things stand; the fix, if it ever matters, is chunking the
submission rather than raising a limit that is not ours.

### Where the payload goes

A lesson's word-level output is around a megabyte, which is the entire Convex
document limit, so the raw prediction output is always stored as a file
(`pronunciationRuns.resultStorageId`) and read back by an action. The row keeps
only counts. Same rule on the phoneme side: OpenPronounce returns two
400-point prosody contours that nothing renders yet, so the whole response goes
to a file and the score row keeps the score, the transcription and up to twelve
mispronounced words.

## What "expected text" a segment is compared against

`compare_audio_with_text()` needs the words the audio *should* contain. This
phase feeds it two different things, and the difference is the interesting part.

**For a retry take — which is what actually runs today — the expected text is
the words the tutor flagged.** An anchored note names them exactly: the
character range the tutor underlined against the line's immutable text. A
line-level note has no range, so the whole utterance is the reference. Both
paths are verified.

This is the strong case, and it is worth being explicit about why: the
reference is *not an ASR guess about the audio being scored*. It is what the
student was asked to say. Comparing a recording against an independent
statement of the target is exactly the comparison a phoneme scorer is for.

**For a transcript line, the only text available without new tutor input is the
line's own ASR text**, and that is the right default — it is the recogniser's
best guess at what was said, which is what a phoneme comparison needs. But the
tension is real and should not be papered over: **if the ASR mis-transcribed a
mispronounced word, comparing against its own guess can mask exactly the error
you are trying to catch.** A student who says "mont" for "month" and is
transcribed as "mont" scores perfectly against "mont".

Two things blunt it, neither of which is a fix:

- Meet's captions and WhisperX are two different recognisers. Where they
  disagree, the disagreement is itself a signal, and this phase already uses a
  weak form of it: a WhisperX word that does not appear in the Meet line
  becomes a line-level draft rather than an anchored one.
- The retry path sidesteps it entirely, which is one more reason it is the leg
  that is wired.

The real fix needs a reference the tutor states rather than one a machine
guesses — an expected phrase on the annotation, typed once when the note is
written. That is a small schema addition and a small form change, and it is
the right first thing for a later phase to do here.

## The lesson-line clip path is not wired, and why

OpenPronounce loads the whole waveform and performs unchunked inference. A
lesson recording must never reach it; it has to be fed one segment at a time.

Cutting a segment out of the lesson recording needs a decoder. The recording is
WebM/Opus written by `MediaRecorder`: a byte range of it is not a decodable
file, and neither Convex runtime can demux and re-encode one — the default
runtime has no WebAssembly, and the Node runtime has no `ffmpeg`. Convex can
hand a whole stored file to a worker, which is what both legs of this phase do.
It cannot produce a smaller one.

So the segment-sized audio this product actually holds is the thing it already
records per phrase: **`retryRecordings`**. That is what the OpenPronounce leg
runs on, and the driver is written over `{ storageId, expectedText }` precisely
so that a lesson-line clip, when one exists, is the same call.

Three ways to make one exist, in the order I would try them:

1. **Capture per-line clips at record time.** The extension already has the
   audio in an offscreen document and already knows the caption boundaries.
   Cutting there is cheap and needs no server-side decoder at all. It changes
   the capture format, which is why it is not a Phase 5 change.
2. **A slicing sidecar** next to the OpenPronounce container: `ffmpeg -ss -t`
   behind one endpoint. Twenty lines, but a second service to deploy, secure and
   keep alive, and the brief for this phase was explicit about deploying
   OpenPronounce's own container rather than a fork or a wrapper.
3. **A WASM demux in a Node action.** Possible, and the most fragile of the
   three: a Matroska demuxer plus an Opus decoder plus a resampler, holding a
   whole lesson in an action's memory, to produce something ffmpeg does in one
   line.

Until one of those lands, the automated pass over a lesson is WhisperX only —
which is the half that produces the drafts a tutor reviews, and is complete.

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

## What Phase 2 could not verify without a browser

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

## What Phase 3 could not verify without a browser

Everything below was checked headlessly against the real deployment, with
authenticated calls and real component rendering — 131 assertions in total:

- **The scheduler** (23 assertions): the published constants, the 1 / 6 /
  `interval × ease` ladder, the ease formula at every grade, the 1.3 floor, and
  failure restarting the sequence. Then 4,800 states across 400 random grade
  sequences compared step by step against a verbatim port of the reference
  `supermemo` implementation — interval, repetition count and ease all agree,
  and `dueAt` always follows the interval.
- **The Convex functions** (84 assertions) against the real deployment with
  real signed tokens: the queue for both the tutor and the student, `null` for
  an unauthenticated caller, due ordering, hydration of note/line/audio,
  grading and its effect on the queue, a note creating exactly one card, a
  deleted note taking its card *and* the card's stored retries with it, the
  retry upload/attach/delete cycle, the pronunciation/filler gate refused at
  both `generateUploadUrl` and `attach` (including an upload minted against a
  retryable card and aimed at a conceptual one), and every validation path.
- **The `/retryAudio` route**: both lesson members get the bytes back
  byte-for-byte; no token, an expired one, and one minted for a different
  issuer each get 401; a signed-in non-participant gets 403; a malformed id, an
  unknown id and a missing parameter get 404/404/400; the CORS preflight allows
  `Authorization` from this site's origin; and `/lessonAudio` still behaves
  exactly as it did before the shared helper was factored out.
- **The clip maths reused for retries** (9 assertions): a retry passed as the
  window `[0, durationMs]` with no offset starts at zero, ends at the file's
  end and is always available, and the Phase 2 lesson-clip behaviour is
  unchanged.
- **The components** (15 renders): `ReviewQueue` and `TrendsView` rendered with
  `react-dom/server` against live query output — the card, the underlined word
  range, the progress bar, all four grade buttons, the saved-take list, the
  recorder present on pronunciation and filler cards and absent on the other
  four, a re-typed card keeping its takes without offering another, the
  empty-queue state, the recurring-term list with its counts, both charts, and
  the per-lesson table.

None of that touches a microphone or a speaker. Still unverified, and more of
it than in Phase 2:

- **`getUserMedia` and `MediaRecorder` in a real tab.** Nothing here has ever
  opened a microphone. The permission prompt, a denial, a machine with no
  microphone, the level meter actually moving, the 60-second auto-stop, and
  what Chrome and Safari really put in the blob are all first-run-only
  discoveries. The error messages for `NotAllowedError`, `NotFoundError` and
  `NotReadableError` are written but have never been triggered.
- **That a retry sounds like the student.** Echo cancellation, noise
  suppression and auto gain are all on; whether that flatters or ruins a
  pronunciation comparison is an audible question.
- **The side-by-side comparison itself** — the point of the feature. Playing the
  original, then a take, then the original again, and hearing the difference.
- **Autoplay policy on the retry.** Clicking a take that is not selected
  downloads it and plays it when it is ready, which is a `play()` call one tick
  after a user gesture. Chrome should allow it because the tab has already
  produced sound; if a take silently fails to start after one click, that is the
  thing to look at.
- **The seeded retries are WAV tones, not speech and not WebM.** They prove the
  route, the storage and the player wiring; they prove nothing about the
  container `MediaRecorder` actually produces. The `Infinity`-duration
  workaround in `use-clip-player.ts` is still untested against real WebM, now on
  two surfaces instead of one.
- **The keyboard shortcuts.** `space` to replay and `1`–`4` to grade are
  suppressed on inputs, textareas, buttons and the take preview's own controls,
  but only a person can confirm that pressing space with the preview player
  focused scrubs the preview instead of replaying the original.
- **The two-column card on a phone**, the bar charts at narrow widths, the
  lesson table's horizontal scroll, focus order through the grade buttons, and
  **dark mode**, which again nothing here rendered.

## What Phase 4 could not verify without a browser

This phase adds no media capture, so the gap is much smaller than Phase 3's.
Everything below was checked against the real deployment with authenticated
calls, impersonating the tutor's and the student's real user ids:

- **Every write refuses the wrong caller.** `interviewQuestions.create` /
  `update` / `remove` refuse an anonymous caller ("Not signed in") and the
  student ("Only the tutor can do that"). `interviewSegments.create` /
  `update` / `remove` / `saveRubric` / `removeRubric` refuse the student with
  "Only the tutor of this lesson can do that" — the session-scoped check, not
  the role one.
- **Every validation path.** An empty or whitespace prompt; a tag over 32
  characters; more than 8 tags; tags lower-cased and deduplicated ("STAR",
  " star " → one `star`); a topic or difficulty outside the union rejected by
  the argument validator before the handler runs; a rubric note over 1,000
  characters; a rubric with nothing in any of the four dimensions; a rating
  outside `strong` / `developing` / `needs-work`.
- **Every ownership and integrity path.** A range whose end line belongs to a
  different lesson; a range that overlaps an existing segment; bounds passed
  in reverse order (normalised, not rejected); moving a segment with only one
  of its two bounds ("needs both its first and last line"); tagging or
  retagging against a question id that no longer exists; acting on a segment
  that has been deleted.
- **Deleting the right things.** A question a segment cites refuses to delete
  and names the count; the same question deletes once the segment is untagged.
  Deleting a segment deletes its rubric with it — confirmed by reading both
  tables back afterwards. `removeRubric` on a segment that has no rubric is a
  no-op, not an error.
- **`saveRubric` replaces.** Saving one dimension over a full rubric leaves
  the other three empty, keeps the same row id, preserves `createdAt` and
  moves `updatedAt`.
- **`getReview` hydrates the new shape** for both members of the pair:
  segments sorted by start order, each with its question inlined, its rubric
  (or `null`), and the rubric author's name.
- **The line-range selection primitive.** `selectionLineIdsWithin` was
  exercised against a real DOM (jsdom, throwaway — not added to the repo):
  a drag from the middle of one line into the next returns both; a drag
  across four returns four in transcript order; a selection inside one line
  returns just that line; a selection that *ends exactly at* the next line's
  leading edge does not pick that line up; a collapsed selection, no
  selection, and a selection that escapes the transcript all return null.

What still needs a person with a browser — all interaction and layout, none
of it correctness:

- **The drag itself.** Selecting text across chat bubbles is the one genuinely
  fiddly interaction here. Whether dragging from the tutor's question down
  through the answer feels natural, whether the two-line minimum ever gets in
  the way, and whether the selection survives the scroll that a long answer
  needs, are all things only a mouse can answer. The primitive is verified;
  the gesture is not.
- **The tag bar appearing under a live selection.** It is rendered inside the
  transcript pane, below the scroller, and the selection is read on the
  scroller rather than the pane precisely so that clicking the bar does not
  clear the selection it acts on. That reasoning has never met a real
  pointer.
- **The segment chip and the warmer ring** on the lines inside a segment —
  whether the run reads as a block at a glance, and whether the ring is
  distinguishable from the active-line ring when the active line is inside a
  segment.
- **The rubric form's length.** Four dimensions, each with three chips and a
  textarea, inside a card on the Interview tab. It is a tall form; whether it
  wants to be a dialog instead is a judgement to make while looking at it.
- **Both popovers' placement** — the question picker opens from the tag bar
  (`side="top"`) and from the segment card (`align="end"`) — and the picker's
  own scrolling once the bank has more than a handful of questions.
- **The question bank page at narrow widths**, the wrapping of the topic and
  difficulty chip rows, and **dark mode**, which again nothing here rendered.

## What Phase 5 could not verify without credentials

Phase 5 is the first phase whose verification costs money, and none of the
three credentials it needs existed while it was written. So the plumbing was
verified exhaustively and the workers were not called once.

**How it was verified.** Not against the dev deployment: against a throwaway
`convex-local-backend` (the open-source binary, SQLite, no account, no
network), with the real schema and the real functions pushed to it, driven by
`ConvexHttpClient` impersonating the seeded tutor's and student's real user
ids, and by `curl`-equivalent requests to the real HTTP actions. The workers
were stood in for: a hand-written WhisperX payload posted to the real callback
route, and a stub HTTP server standing in for OpenPronounce. **80 assertions,
all passing.** The scaffolding was thrown away; nothing test-only was left in
the repo.

What that covered:

- **The whole enqueue-and-callback chain**, end to end and in that order:
  `scoring.start` → the scheduled action → the run-scoped audio URL → the
  callback HTTP action → `acceptResult` → `buildSuggestions` →
  `saveSuggestions` → a completed run with drafts in it.
- **The callback's auth, before anything else runs.** No token, wrong token,
  the audio token replayed on the callback route, the callback token replayed
  on the audio route, a valid token for a run that does not exist, and both
  routes with `SCORING_CALLBACK_SECRET` unset. 401, 401, 401, 401, 404, 503.
- **The audio route's lifetime.** It serves the recording with the right
  content type while its run is active and 404s once the run has finished.
- **Idempotency.** A repeat delivery of the same prediction is answered 200 and
  changes nothing, including deleting the bytes it was handed. A delivery that
  arrives after the expiry timer has failed the run is dropped the same way.
- **The word-to-line mapping**, which is where the real bugs would be:
  timestamps offset by `audioOffsetMs`; punctuation stripped, so `supportive,`
  and `thinking.` anchor to the bare words; a word the Meet captions do not
  contain becoming a line-level draft; one-letter words dropped; words above
  the confidence threshold dropped; words the aligner could not place (no
  `score`) dropped but still counted; the tutor's own low-confidence words
  ignored entirely; and a word sitting nearer the tutor's caption than the
  student's dropped rather than pulled across the turn boundary.
- **That the pipeline writes no notes.** After a completed run: four
  suggestions, zero annotations, zero review cards.
- **The draft state machine.** The student is refused on confirm; the tutor
  confirms and gets exactly one note, marked `source: "auto"`, keeping the
  draft's word range, owned by the tutor who confirmed it, with exactly one
  review card; a draft cannot be confirmed twice; a rewritten note and a
  changed type are what get saved; dismissing writes nothing and keeps the row;
  a second pass proposes zero of the four it proposed the first time.
- **Who sees what.** The tutor's `getReview` returns only drafts nobody has
  acted on, plus the confirmed/dismissed tally. The student's returns no drafts
  and no run at all, but does return the confirmed notes with their `source`.
- **Expiry and cancellation.** An unanswered run expires with an explanation
  and frees the lesson; cancelling does the same immediately.
- **The OpenPronounce leg against a stub.** With no `OPENPRONOUNCE_URL` set, a
  saved take produces no row and no error. With it set: one POST to
  `/pronunciation` with the trailing slash trimmed, `expected_text` equal to the
  tutor's anchored quote (and equal to the whole line for a line-level note),
  `lang=en`, the take as a file part, and the Modal proxy-auth headers present.
  The score, the transcription and the mispronounced words land on the row, the
  full response goes to a file, and the study queue query carries all of it.
  A 500 from the worker is recorded on the take rather than thrown at the
  student.
- **The delete cascade.** Deleting a take deletes its score. Deleting the note
  deletes the card, the takes and their scores.

### What David has to do before any of this touches a real worker

1. Create a Replicate account with billing and a token (§8a).
2. Deploy OpenPronounce and create a Modal proxy token pair (§8b).
3. Generate the callback secret (§8c).

None of the three can be provisioned from here.

### What is therefore unverified

- **Any real call to Replicate.** The request body is built from the model's
  current published schema — `audio_file`, `language`, `align_output`,
  `diarization`, read off `replicate.com/victor-upmeet/whisperx` on 2026-09-04
  — and the version is pinned to `655845d6…` (published 2026-05-13). The
  webhook body is parsed as the documented prediction object. All of that is
  read from documentation, not from a response. **The first real pass is the
  test**, and it is the one to watch: check that `align_output: true` actually
  produced `words` with `score` on every segment, and that the run completes
  rather than failing on "returned no aligned segments".
- **Whether the confidence threshold is set anywhere near right.** `0.35` is a
  judgement about a distribution nobody in this repo has seen. It is one
  constant in `model/scoring.ts` with the reasoning next to it. Expect to move
  it after the first two real lessons, and expect to move it *down* if the tutor
  is drowning.
- **Whether the flags are any good.** Alignment confidence is not a
  pronunciation judgement — it is how surely the model could place a word — and
  a noisy line will score low without anyone having mispronounced anything.
  This is exactly why the output is a draft. How much of it is worth confirming
  is a question only a tutor with a real lesson can answer.
- **The real cost of a pass.** See §8a: the public pricing page no longer lists
  the hardware this model runs on. The figure there is an estimate.
- **Everything about the deployed OpenPronounce container**: that the Modal
  descriptor deploys, that a ~6 GB image cold-starts inside the 300-second
  startup timeout, that 8 GB and two cores are enough for two Wav2Vec2
  checkpoints, and that its gTTS reference voice — which needs the network the
  first time it sees a given sentence — behaves inside a Modal container. The
  request and response shapes were taken from `server.py` and
  `openpronounce/speech.py` at tag `v0.3.0` and exercised against a stub that
  returns exactly that shape.
- **Every pixel.** Nothing here rendered anything. The Suggestions tab, the run
  card's four states, the dashed grey underline sitting next to the six solid
  coloured ones (does it read as "not yet" or as "broken"?), the score readout
  under a take with two IPA columns at narrow widths, the popover placement on
  **Edit first**, and dark mode, which again nothing rendered.
- **What a two-minute wait feels like.** The run card is live and the tutor can
  walk away, but nobody has watched it.

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

- Phase 5 added three tables and one optional field. `annotations.source` is
  `"tutor" | "auto"`, optional so it needed no migration; anything that writes an
  annotation from now on has to say which it is. `scoring.confirmSuggestion` is
  the only writer of `"auto"`, and it is the only path from any model's output
  into `annotations`.
- `pronunciationSuggestions` is deliberately not "annotations with a status".
  The study queue, the trends view and the student's own review all read
  `annotations` and none of them know this phase exists, which is the property
  worth keeping. A sixth kind of machine output should be a fifth row in that
  table, not a seventh annotation type.
- Phase 4's note asked Phase 5 to keep rubric feedback out of `annotations`, and
  suggested that machine output beside a rubric should be "a second row per
  segment marked as machine-authored that the tutor confirms". That is exactly
  the shape `pronunciationSuggestions` has, minus the segment link. A phase that
  wants machine-drafted rubric feedback should add
  `interviewRubricSuggestions` alongside it rather than widening this table —
  the two promote into different places.
- `/scoring/whisperx` and `/scoring/audio` are the first routes in this codebase
  that authorize something that is not a person. Do not reach for
  `model/sessions.ts` when adding a third; use `authorizeRun` in `http.ts` and
  give the new route its own `purpose` string, so a token minted for one route is
  useless on another.
- The run token is derived from `SCORING_CALLBACK_SECRET` and never stored.
  Rotating the secret is therefore a real operation with a real cost: every run
  in flight will expire rather than land. That is the intended trade — the
  alternative was a stored per-run nonce that a rotation would not touch.
- **Nothing can cut the lesson recording into per-line clips.** This is the one
  thing the phase wanted and could not build; "The lesson-line clip path is not
  wired" above has the three ways out and which one to try first. If a later
  phase makes clips exist, `internal.retryScoring.score` is written over
  `{ storageId, expectedText }` and needs no change — write a sibling action that
  hands it a clip.
- The expected text a phoneme comparison uses is an ASR guess for a transcript
  line and the tutor's own flagged words for a retry take. The second is sound;
  the first can mask the very error it is looking for. The fix is an expected
  phrase typed on the annotation, not a cleverer default. See "What 'expected
  text' a segment is compared against".
- `LOW_CONFIDENCE`, `MIN_WORD_LENGTH` and `MAX_SUGGESTIONS_PER_RUN` in
  `model/scoring.ts` are the three knobs that decide how much a tutor is asked to
  read. They are constants with their reasoning next to them rather than
  settings, because a per-pair setting for something nobody has calibrated once
  is a knob with no right answer. Calibrate them, then decide whether they should
  be settings.
- `WHISPERX_VERSION` is pinned. The model's author has re-pointed it at new base
  images before, and a silent change to the aligner is a silent change to which
  words this product flags. Bump it on purpose, and re-read the output shape when
  you do — this phase already depends on `words[].score` existing, which only
  appears when `align_output` is true.
- Replicate predictions are created with `Cancel-After: 15m`, and this
  deployment gives up on a run after 30 minutes. Those two numbers should stay
  in that order.
- Retry takes are scored automatically and lesson passes are not. If that ever
  looks inconsistent, the difference is that one is CPU cents on a container that
  scales to zero and the other is GPU minutes billed by the second.
- `reviewCards` is no longer empty: `annotations.create` writes one card per
  note and `annotations.remove` deletes it. Any new annotation-shaped thing
  has to decide whether it belongs in the queue, rather than assuming the
  queue is opt-in.
- Phase 3 left the note above asking Phase 4 to keep rubric feedback out of
  `annotations` for exactly that reason. It did: rubric feedback lives in
  `interviewRubrics`, `createForAnnotation` was not touched, and
  `reviewCards` is still sourced only from annotations. Phase 5 should keep
  it that way unless it has a concrete reason a rubric item is worth
  drilling — and a rubric item is a judgement about a whole answer, which is
  not what a two-second clip comparison is for.
- The rubric rating is a three-level qualitative scale, not a number, and
  nothing aggregates it yet. If Phase 5's automated scoring wants to sit
  beside it, the natural shape is a second row per segment marked as
  machine-authored that the tutor confirms — the same "draft the model
  produced, human published it" split Phase 5 already plans for
  pronunciation, not an extra field on the tutor's own row.
- `interviewSegments` deliberately stores both the bounding line ids and
  their `order` values. The ids are the anchor; the orders are what overlap
  checks and range rendering compare. That is safe only because a transcript
  line's `order` never changes after it is written. If a later phase ever
  renumbers lines — a re-alignment pass, say — it has to move the segments
  too.
- Interview segments may not overlap, and `requireFreeRange` enforces it. If
  a later phase wants nested or overlapping ranges (a follow-up question
  inside an answer, for instance), that rule is the single place to change,
  but the transcript's own highlighting assumes at most one segment per line.
- `retryRecordings` rows are the only user-generated audio the website itself
  creates. Anything that deletes a lesson later has to reach them through their
  cards: `model/reviewCards.ts` has `deleteRetriesForCard` for exactly that, and
  there is still no lesson-deletion path anywhere in the product.
- Phase 5's pronunciation scoring has an obvious input waiting for it: a retry
  recording plus the exact expected text (the annotation's char range against
  the line, or the whole line). That pairing is why `retryRecordings` stores
  `annotationId` alongside `reviewCardId` — the expected text is reachable
  without going through the card.
- Function history, so a later phase does not have to read the log:
  `transcriptLines.append` landed in Phase 1a; `annotations.create`, `update`
  and `remove` in Phase 2; `reviewCards.queue`/`grade`/`backfill`,
  `retryRecordings.*` and `trends.forCurrentPair` in Phase 3;
  `interviewQuestions.*` and `interviewSegments.*` in Phase 4; `scoring.*`,
  `retryScoring.*` and the `/scoring/*` HTTP routes in Phase 5. Phase 5 also moved `normalizeNote`
  and `normalizeRange` out of `annotations.ts` into
  `packages/convex/convex/model/annotations.ts`, because `confirmSuggestion`
  writes annotations too and a promoted note has to be exactly as well-formed as
  a typed one.
- `trends.forCurrentPair` reads every transcript line of every lesson on every
  call. It is honest and cheap at a lesson a week; it is the first query that
  will want a scheduled rollup, and the spec already names scheduled functions
  as where that goes.
- The grade mutation takes the full SM-2 range 0-5 even though the UI only ever
  sends 2-5. That is deliberate: the algorithm's input domain is the algorithm's,
  and a future surface (an auto-graded drill, say) should not have to widen a
  validator to use it.
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
- Nothing calls `ctx.storage.getUrl` any more. Lesson audio and retry
  recordings are served by the authenticated `/lessonAudio` and `/retryAudio`
  HTTP actions in `packages/convex/convex/http.ts` (see "Serving lesson audio"
  and "Serving retry audio" above), which re-check the caller against the
  lesson on every request. Both are registered by the same `routeStoredAudio`
  helper: a third private file should be a fourth call to it, not a third
  handler.
- `SITE_URL` is load-bearing twice over: Convex Auth validates sign-in
  redirects against it, and both audio routes use it as the CORS origin. A
  deployment whose `SITE_URL` does not match the site's real origin will sign
  users in but fail to play any audio, lesson or retry.
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
