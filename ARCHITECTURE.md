# Architecture

Verbatim is a Bun workspace built with Turborepo. A Chrome extension captures a
Google Meet lesson, a Next.js site reviews it, and a Convex deployment holds the
data, the rules and the audio.

```text
 Chrome extension ──mutations──▶ ┌──────────────────┐ ◀──queries/mutations── Next.js site
 (captions, mixed audio)         │ Convex           │        (live, via Convex Auth)
                                 │ tables, files,   │
 Browser ◀──── /lessonAudio ──── │ HTTP actions     │ ──── /scoring/audio ───▶ Replicate
 (bearer token) /retryAudio      │                  │ ◀─── /scoring/whisperx ─ (WhisperX)
                                 │                  │ ──── POST /pronunciation ▶ OpenPronounce
                                 └──────────────────┘                            (Modal)
```

## Packages

| Path                  | Package               | Role                                                                                                 |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web`            | `@verbatim/web`       | Next.js App Router site: dashboard, review, study, interview, extension handoff.                     |
| `apps/extension`      | `@verbatim/extension` | WXT Chrome MV3 extension. Reads Meet captions, captures tab and microphone audio, uploads to Convex. |
| `packages/convex`     | `@verbatim/backend`   | Convex schema, functions and HTTP routes. Convex Auth with Google.                                   |
| `packages/ui`         | `@verbatim/ui`        | Shared React components.                                                                             |
| `infra/openpronounce` | none                  | Modal deployment descriptor for the OpenPronounce server.                                            |

`apps/web` and `apps/extension` import the typed API from
`@verbatim/backend/convex/_generated/api`. `convex dev` and `convex codegen`
write `_generated`, and git ignores it. Typecheck and build need it, so run
`bunx convex dev --once` in `packages/convex` first on a fresh clone.

## Data model

All tables are in [`schema.ts`](packages/convex/convex/schema.ts). Convex Auth's
own tables are spread in alongside.

```text
users ─┬─ pairedWithUserId ─▶ users
       │
       └─ tutorId / studentId ─▶ lessonSessions ─┬─▶ transcriptLines
                                                 ├─▶ annotations ─▶ reviewCards ─▶ retryRecordings ─▶ pronunciationScores
                                                 ├─▶ interviewSegments ─▶ interviewRubrics
                                                 │        └─▶ interviewQuestions
                                                 └─▶ pronunciationRuns ─▶ pronunciationSuggestions
```

| Table                      | Holds                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                    | Google identity, `role` (`tutor` or `student`), `pairedWithUserId`, `standingConsent`, a one-time `pairingInviteCode`.                                                                                                     |
| `lessonSessions`           | One lesson: tutor, student, times, `status` (`recording`, `processing`, `ready`, `incomplete`), the recording (`audioStorageId`, `audioDurationMs`, `audioOffsetMs`) and the two consent values as they were at the start. |
| `transcriptLines`          | One caption line: text, `startMs`, `endMs`, `order`, and `speakerId` when the Meet name matches a participant, else `speakerLabel`. Text and `order` never change after a write.                                           |
| `annotations`              | A note on a line: one of six `type`s, an optional `charStart`/`charEnd` range, `authorId`, and `source` (`tutor` or `auto`).                                                                                               |
| `reviewCards`              | SM-2 state for one note: `dueAt`, `interval` (days), `ease`, `repetitions`, `lapses`, last review and grade. `studentId` names whose queue it is in.                                                                       |
| `retryRecordings`          | A student's take at a flagged phrase, with the stored audio and its duration.                                                                                                                                              |
| `interviewQuestions`       | The question bank: topic, difficulty, prompt, tags. Not tied to a lesson.                                                                                                                                                  |
| `interviewSegments`        | A run of transcript lines tagged with a question, with cached `startOrder` and `endOrder`.                                                                                                                                 |
| `interviewRubrics`         | Four-dimension feedback on a segment: structure, conciseness, tradeoffs, vocabulary.                                                                                                                                       |
| `pronunciationRuns`        | One tutor-started lesson analysis: `status` (`queued`, `transcribing`, `scoring`, `complete`, `failed`), the provider's `predictionId`, the stored raw output, counts and any error.                                       |
| `pronunciationSuggestions` | A model-proposed note awaiting review: `worker`, note, range, `confidence`, `status` (`pending`, `confirmed`, `dismissed`) and, once confirmed, the `annotationId`.                                                        |
| `pronunciationScores`      | The read-only phoneme result for one retry take: expected text, `score`, heard `transcript`, up to 12 word errors, and the stored full response.                                                                           |

Audio bytes live in Convex file storage. Rows hold storage ids and never a URL.

## Backend layout

Each public file in `packages/convex/convex` is a feature module. Shared rules
live in `model/`, so two modules never reimplement them.

| File                                                            | Owns                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `users.ts`                                                      | Role, pairing, consent.                                                                                                                       |
| `lessonSessions.ts`                                             | Starting and finishing a lesson, audio upload, the review query.                                                                              |
| `transcriptLines.ts`                                            | Appending captions from the extension.                                                                                                        |
| `annotations.ts`, `model/annotations.ts`                        | Note writes and their validation.                                                                                                             |
| `reviewCards.ts`, `model/reviewCards.ts`, `model/scheduling.ts` | The queue, card creation and SM-2.                                                                                                            |
| `retryRecordings.ts`, `retryScoring.ts`                         | Retry takes and their OpenPronounce score.                                                                                                    |
| `interviewQuestions.ts`, `interviewSegments.ts`                 | The interview layer.                                                                                                                          |
| `scoring.ts`, `model/scoring.ts`                                | Lesson analysis runs, flagging and suggestions.                                                                                               |
| `trends.ts`                                                     | Read-only aggregates across a pair's lessons.                                                                                                 |
| `model/sessions.ts`                                             | Access helpers: `isSessionMember`, `requireOwnSession`, `requireSessionTutor`, `requireTutor`, `requireOwnReviewCard`, `authorizeStoredFile`. |
| `http.ts`                                                       | The HTTP routes `/lessonAudio`, `/retryAudio`, `/scoring/audio` and `/scoring/whisperx`, plus the Convex Auth routes.                         |
| `auth.ts`, `auth.config.ts`                                     | Convex Auth with the Google provider.                                                                                                         |

See [docs/auth.md](docs/auth.md) for the access rules.

## Scoring flow

Lesson analysis, with the table and route each step touches:

1. A tutor presses **Analyse this lesson**. `scoring.start` inserts a
   `pronunciationRuns` row (`queued`).
2. `submitWhisperx` posts a prediction to Replicate with a run-scoped audio URL
   and a run-scoped webhook URL. The run becomes `transcribing`.
3. Replicate fetches `/scoring/audio` and later posts the aligned words to
   `/scoring/whisperx`. Both calls carry an HMAC token for that run and route.
   The output is stored as a file and the run becomes `scoring`.
4. `buildSuggestions` keeps low-confidence words the student spoke, ranks them,
   and `saveSuggestions` writes at most 40 `pronunciationSuggestions` rows. The
   run becomes `complete`.
5. A tutor confirms a suggestion. `scoring.confirmSuggestion` writes an
   `annotations` row with `source: "auto"` and its `reviewCards` row. This is
   the only path from a model to `annotations`.

Retry scoring is separate. `retryRecordings.attach` saves a take and schedules
`retryScoring.score`, which posts the take to OpenPronounce and writes one
`pronunciationScores` row. It never writes to `annotations` or `reviewCards`.

[docs/scoring.md](docs/scoring.md) has the flagging rules, the tokens and the
tunable constants.
