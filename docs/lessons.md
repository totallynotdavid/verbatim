# Reviewing a lesson

`/dashboard` lists the pair's lessons, newest first. Each row shows the date,
length, whether it has audio, how many notes it carries, and a status badge.
Opening a lesson goes to `/dashboard/sessions/<id>`
([`review-view.tsx`](../apps/web/src/app/dashboard/sessions/[sessionId]/review-view.tsx)).

Lesson status is one of `recording`, `processing`, `ready` and `incomplete`. See
[capture.md](capture.md) for how a lesson reaches each.

## The review screen

The transcript fills the main pane as a speaker-grouped conversation. Audio
controls and the notes for the selected line sit in the side panel. Tabs under
the header switch between **Transcript** and **Notes**, and the **Interview**
and **Suggestions** tabs described in [interview.md](interview.md) and
[scoring.md](scoring.md).

| Action                                    | Result                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Click a line                              | Highlights it, seeks the recording to it, and stops at the end of the clip. |
| **Prev** / **Next**, `↓` / `j`, `↑` / `k` | Move to the next or previous utterance.                                     |
| `space`                                   | Replays the current line, or stops it.                                      |
| Select words inside one line              | Opens a note composer anchored to the selection.                            |
| **note** button on a line                 | Attaches a note to the whole line.                                          |

The keyboard shortcuts are ignored while typing in a field and when a modifier
key is held.

## Notes

A note has one of six types, shown as an underline colour: `pronunciation`,
`grammar`, `word-choice`, `filler`, `interview-structure`, `technical`. The
composer is in
[`annotation-form.tsx`](../apps/web/src/app/dashboard/sessions/[sessionId]/annotation-form.tsx).

- A note anchors to a character range inside one line (`charStart`, `charEnd`),
  or to the whole line when it has none. Transcript text never changes after it
  is written, so ranges stay valid. A range that covers the whole line is stored
  as no range.
- A note is at most 2000 characters (`model/annotations.ts`).
- Both people see both people's notes, live. Only a note's author can edit or
  delete it.
- Every note creates one review card for the student. See
  [study-loop.md](study-loop.md).
- A note's `source` is `tutor` for typed notes and `auto` for a suggestion the
  tutor confirmed. Notes created before the field existed read as `tutor`.
  Confirmed notes show a **Confirmed** mark.

## Playback

`lessonSessions.getReview` returns the transcript, notes and an authenticated
audio URL ([auth.md](auth.md#recording-audio)). The page downloads the recording
once into a blob and plays every clip from it, so clicking through lines makes
no further requests.

- **Clip window.** [`clip.ts`](../apps/web/src/lib/clip.ts) maps a line's
  `startMs` and `endMs` to audio time by subtracting `audioOffsetMs` and adds
  250 ms (`CLIP_PADDING_MS`) on each side. Meet stamps a caption when its text
  settles, so the padding keeps word onsets and endings inside the clip.
- **Stopping.** [`use-clip-player.ts`](../apps/web/src/lib/use-clip-player.ts)
  pauses at the end of a clip from both `timeupdate` and a
  `requestAnimationFrame` loop, because either can be delayed or suspended on
  its own.
- **Duration.** WebM from `MediaRecorder` has no duration in its header, so the
  player uses `audioDurationMs` from the session. When the browser reports a
  non-finite duration, the player seeks far past the end once to make it scan
  the file, with a 3 second timeout.
- **Lines outside the recording.** If audio started late, earlier lines show "no
  audio" instead of playing whatever is at second zero.
