# The study loop

Every note a tutor or student writes becomes a card in the student's review
queue. `/dashboard/review` shows one due card at a time. `/dashboard/trends`
aggregates the pair's lessons. Both people can open both pages, and the queue is
the student's either way. Neither page needs the extension.

## Reviewing a card

A card shows the flagged line (with the underlined word range, if the note had
one), the note, the original clip on the left, and the student's own retries on
the right.

1. **Play original** plays the clip from that card's lesson recording, with the
   same 250 ms padding as the transcript viewer. `space` replays it.
2. On a **pronunciation** or **filler** card, **Record a retry** opens the
   browser's microphone prompt the first time. Record, press **Stop**, listen to
   the preview, then **Keep this take** or **Discard**. The other four note
   types show the original clip and no recorder.
3. Kept takes are listed under **Your retry**. Click a take to hear it and the
   original to compare. Both people can hear a take. Only the person who
   recorded it can delete it.
4. Grade the card with **Again**, **Hard**, **Good** or **Easy**, or the keys
   `1` to `4`. The card leaves today's queue and returns when its next review is
   due. The header counts `n of m done today`.
5. When the queue is empty the page says so and when the next card is due.

The shortcuts are ignored on inputs, textareas, buttons and the take preview's
own controls.

## Scheduling

[`model/scheduling.ts`](../packages/convex/convex/model/scheduling.ts)
implements SM-2:

- A pass (grade 3 or more) after zero passes schedules 1 day, after one pass 6
  days, and after that `round(interval × ease)`.
- A failure (grade below 3) sets the interval to 1 day, the consecutive-pass
  count `repetitions` to 0, and adds one to `lapses`.
- After every review, ease changes by
  `0.1 - (5 - grade) × (0.08 + (5 - grade) × 0.02)`, with a floor of 1.3. A new
  card starts at 2.5.
- `dueAt` is the review time plus the interval in days.

The four buttons map to SM-2 grades in
[`review-grades.ts`](../apps/web/src/lib/review-grades.ts):

| Button | Key | Grade | Ease change |
| ------ | --- | ----- | ----------- |
| Again  | `1` | 2     | -0.32       |
| Hard   | `2` | 3     | -0.14       |
| Good   | `3` | 4     | 0           |
| Easy   | `4` | 5     | +0.10       |

A failed card comes back the next day. There are no same-day learning steps.
`reviewCards.grade` accepts the full SM-2 range 0 to 5; the UI sends 2 to 5.

## Card lifecycle

- **Creation.** `annotations.create` inserts the note and its `reviewCards` row
  in one mutation. `scoring.confirmSuggestion` does the same for a confirmed
  suggestion. Both call `createForAnnotation`
  ([`model/reviewCards.ts`](../packages/convex/convex/model/reviewCards.ts)). A
  new card is due immediately.
- **Editing.** `annotations.update` changes a note's text or type and leaves its
  card's schedule alone.
- **Deletion.** `annotations.remove` deletes the card, every retry on it, the
  stored audio of each, and each retry's score.
- **Backfill.** Notes written before cards existed have none. This creates them
  and is safe to run again:

  ```sh
  cd packages/convex
  bunx convex run reviewCards:backfill
  ```

  It returns `{ created, skipped }`, skipping notes that already have a card.

## Retry recordings

A retry is a row in `retryRecordings`, separate from the lesson audio. The
browser records with `getUserMedia` and `MediaRecorder`
([`use-mic-recorder.ts`](../apps/web/src/lib/use-mic-recorder.ts)). This is the
website's own microphone permission, unrelated to the extension's.

- **Container.** The recorder uses the first type the browser supports from
  `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg;codecs=opus`, `audio/mp4`.
  A browser without `MediaRecorder` says so instead of showing a dead button.
- **Duration.** It is measured while recording and sent with the upload, since
  `MediaRecorder` writes WebM without one.
- **Limits.** The recorder stops itself at 60 seconds. `retryRecordings.attach`
  refuses a duration that is not positive or exceeds 120 seconds, and a card
  holds at most 20 takes. When `attach` rejects a take, it deletes the uploaded
  bytes unless a saved retry already points at them.
- **Which notes.** Only `pronunciation` and `filler` notes accept takes.
  `supportsRetry` in
  [`annotation-types.ts`](../apps/web/src/lib/annotation-types.ts) hides the
  recorder. `requireRetryableCard` in
  [`retryRecordings.ts`](../packages/convex/convex/retryRecordings.ts) refuses
  the write in both `generateUploadUrl` and `attach`. Changing a note's type
  later leaves its takes listed and playable but offers no new recording.
- **Playback.** Takes are served from `/retryAudio`
  ([auth.md](auth.md#recording-audio)).
- **Scoring.** When a pronunciation worker is configured, each saved take is
  scored. See [scoring.md](scoring.md#retry-scoring).

## Trends

`trends.forCurrentPair` reads every transcript line and note of the pair's
lessons and writes nothing.

- **Words per minute.** All transcribed words over the time from the lesson
  start to the end of the last caption (the last line's `endMs`). A lesson with
  no captions has no rate and shows `—`.
- **Filler rate.** `filler` notes per 100 transcribed words.
- **Recurring words and sounds.** Notes grouped by what they flag, shown only
  when a term appears more than once. A note anchored to a range names the
  underlined words. A line-level note contributes the spans it quotes (`'th'`,
  `"much faster"`), which must sit on word boundaries; with no quotes, its own
  text. Terms are lowercased, and edge punctuation is stripped.
- **Per-lesson table.** Each lesson's note count by type, linked to its
  transcript.
