# Pronunciation scoring

Two optional workers add pronunciation feedback. Without them the rest of
Verbatim works unchanged.

| Worker                                                      | Input                    | Output                                |
| ----------------------------------------------------------- | ------------------------ | ------------------------------------- |
| WhisperX on [Replicate](https://replicate.com)              | A whole lesson recording | Draft notes for the tutor to confirm. |
| [OpenPronounce](https://github.com/Halleck45/OpenPronounce) | One saved retry take     | A read-only score on the take.        |

## Setup

Run these from `packages/convex`.

**Replicate.** Create a Replicate API token on an account with billing, then:

```sh
bunx convex env set REPLICATE_API_TOKEN r8_...
```

**Callback secret.** Replicate's requests to Convex are authorized with tokens
derived from a secret you generate:

```sh
bunx convex env set SCORING_CALLBACK_SECRET "$(openssl rand -hex 32)"
```

**OpenPronounce.** Deploy it with
[`infra/openpronounce`](../infra/openpronounce/README.md), then:

```sh
bunx convex env set OPENPRONOUNCE_URL https://<workspace>--verbatim-openpronounce.modal.run
bunx convex env set OPENPRONOUNCE_KEY <proxy token id>
bunx convex env set OPENPRONOUNCE_SECRET <proxy token secret>
```

| Variable                                    | Needed by       | When unset                                                                           |
| ------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `REPLICATE_API_TOKEN`                       | Lesson analysis | The run fails at once with "REPLICATE_API_TOKEN is not set on this deployment".      |
| `SCORING_CALLBACK_SECRET`                   | Lesson analysis | The run fails at once with a message naming it. Both `/scoring/*` routes answer 503. |
| `CONVEX_SITE_URL`                           | Lesson analysis | The run fails at once with a message naming it. Convex sets it.                      |
| `OPENPRONOUNCE_URL`                         | Retry scoring   | Takes are not scored and nothing errors.                                             |
| `OPENPRONOUNCE_KEY`, `OPENPRONOUNCE_SECRET` | Retry scoring   | The request goes without `Modal-Key` and `Modal-Secret` headers.                     |

## Lesson analysis

The lesson's tutor opens a `ready` lesson that has a recording and presses
**Analyse this lesson** on the **Suggestions** tab. It is never automatic,
because each run is billed by Replicate. One run per lesson can be active at a
time, and the tutor can cancel it.

```text
scoring.start ──▶ scoring.submitWhisperx ──▶ Replicate
                                               │ fetches  GET /scoring/audio
                                               ▼
pronunciationSuggestions ◀── buildSuggestions ◀── POST /scoring/whisperx
```

1. `scoring.start` inserts a `pronunciationRuns` row (`queued`) and schedules
   `submitWhisperx` and an expiry job.
2. `submitWhisperx` creates a Replicate prediction on the model version pinned
   as `WHISPERX_VERSION` in
   [`model/scoring.ts`](../packages/convex/convex/model/scoring.ts). The input
   is `audio_file` (a run-scoped URL to `/scoring/audio`), `language: "en"`,
   `align_output: true` and `diarization: false`, with the callback as webhook
   for the `completed` event. It sends `Cancel-After: 15m`. The run moves to
   `transcribing`.
3. Replicate fetches the audio, then posts the prediction to
   `/scoring/whisperx`. `acceptResult` stores the output as a file and moves the
   run to `scoring`.
4. `buildSuggestions` turns the aligned words into drafts and `saveSuggestions`
   writes them. The run ends `complete` with `wordsRead` and
   `suggestionsCreated`.

A run that has not reported back within 30 minutes (`RUN_TIMEOUT_MS`) fails with
an explanation, and its prediction is canceled. The Suggestions tab shows a
run's status as _Starting…_, _Listening to the recording…_, _Reading the
transcript…_, _Finished_ or _Did not finish_.

### Which words become drafts

`flagWords` in `model/scoring.ts` keeps a word when:

- it has both a `start` time and an alignment `score`, and the score is below
  `LOW_CONFIDENCE` (0.35);
- it is at least `MIN_WORD_LENGTH` (2) characters after stripping punctuation;
- its time, `start × 1000 + audioOffsetMs`, falls within 1.5 seconds of a
  caption line, and that line was spoken by the student.

Words are ranked lowest score first, and at most `MAX_SUGGESTIONS_PER_RUN` (40)
become drafts. A draft anchors to the word's character range when the word
appears in the caption text on a word boundary, and is line-level otherwise.
`saveSuggestions` skips any span that already has a suggestion, confirmed or
dismissed, or a note, so a second run proposes only new spans.

The score is the aligner's confidence that it placed the word. It is not a
pronunciation grade. The Suggestions tab shows it as "n% clear".

### Reviewing drafts

Drafts live in `pronunciationSuggestions` with status `pending`. Nothing a model
produces is written to `annotations` until a tutor confirms it. Each draft shows
the word, a draft note, its clarity and its line.

- **Confirm as a note** runs `scoring.confirmSuggestion`: it inserts an
  annotation with `source: "auto"`, authored by the confirming tutor, and
  creates its review card. The suggestion stays, marked `confirmed`.
- **Edit first** opens the note composer with the draft filled in, so the tutor
  can rewrite the note and change its type, which defaults to `pronunciation`.
- **Dismiss** marks the suggestion `dismissed` and writes nothing.

On the transcript, a pending draft is a dashed grey underline, and a line's
footer counts the drafts waiting. The student's Suggestions tab says the tutor
reviews them first and shows no drafts or run. Confirmed notes appear in the
student's transcript and queue like any other note.

## Worker authorization

Replicate holds no Convex Auth token and cannot send custom headers on a
webhook, so authorization travels in the URL. Each run gets two tokens:

```text
token = HMAC-SHA256(SCORING_CALLBACK_SECRET, "<purpose>:<runId>")   # hex
```

`purpose` is `audio` or `callback`. `authorizeRun` in
[`http.ts`](../packages/convex/convex/http.ts) checks the token before it reads
a body or loads a row:

| Status | Cause                                                     |
| ------ | --------------------------------------------------------- |
| 503    | `SCORING_CALLBACK_SECRET` is unset.                       |
| 401    | `run` or `token` is missing, or the token does not match. |
| 404    | The token is valid but the run does not exist.            |

A token is valid for one run and one route, so the audio token fails on the
callback route and the reverse. The secret itself is never sent anywhere.
Rotating it invalidates every outstanding token, and runs in flight expire.

`/scoring/audio` serves the lesson recording only while its run is `queued`,
`transcribing` or `scoring`, with `Cache-Control: private, no-store`. The same
20 MB response limit applies as for [`/lessonAudio`](auth.md#recording-audio).

Webhook delivery can repeat and the expiry job can race it, so every terminal
path is idempotent. `patchRun` refuses to change a finished run, `acceptResult`
deletes the bytes of a result that arrives for a run no longer `transcribing`,
and the route answers 200 either way.

A lesson's word-level output can approach Convex's document size limit, so the
raw output is always stored as a file (`pronunciationRuns.resultStorageId`) and
the row keeps counts only.

## Retry scoring

`retryRecordings.attach` schedules `retryScoring.score` for each saved take. It
returns without doing anything when `OPENPRONOUNCE_URL` is unset.

1. The expected text is the phrase the student was asked to say. For a note
   anchored to a range it is that range of the line's text. For a line-level
   note it is the whole line. A take whose expected text is empty or longer than
   600 characters is not scored.
2. The action posts one multipart request to `<OPENPRONOUNCE_URL>/pronunciation`
   with `file` (the take, as `retry.webm`), `expected_text` and `lang=en`,
   adding `Modal-Key` and `Modal-Secret` when both are set.
3. The `pronunciationScores` row (`scoring`, then `complete` or `failed`) keeps
   the `score`, what the recognizer heard (`transcript`), the expected text, and
   up to 12 word errors with expected and heard phonemes, highest confidence
   first. The full response is stored as a file (`detailStorageId`).

Takes show the score as `n/100`, what was heard, and each word as
`/expected/ → /heard/` with a percentage. A worker error is recorded on the take
and shown there. The score does not feed the SM-2 grade. Deleting a take deletes
its score, and deleting its note deletes both.

Only retry takes are sent to OpenPronounce, never a lesson recording: the server
loads the whole waveform and runs unchunked inference, so it needs phrase-length
audio.
