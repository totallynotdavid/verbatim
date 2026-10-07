# Verbatim

Verbatim turns an English-tutoring lesson held on Google Meet into a transcript
with audio, per-sentence playback, tutor notes, and a spaced-repetition queue of
the things the student got wrong. It is built for one tutor paired with one
student.

A Chrome extension captures Meet's live captions and one mixed recording of the
call. A Next.js site, backed by Convex, is where the pair reviews, annotates and
studies.

```sh
git clone https://github.com/totallynotdavid/verbatim.git && cd verbatim
bun install
bun run dev
```

`bun run dev` needs a Convex deployment and a Google OAuth client first.
[SETUP.md](SETUP.md) walks through both.

## What you see

After a lesson, `/dashboard` lists it with its date, length, note count and
status. Open it and click a line to hear that sentence. Select words in the line
to attach a note. The note is underlined in its type's colour and joins the
student's study queue.

The student's **Review** page then shows one card at a time: the flagged line,
the note, the original clip, and a recorder for a retry. When a pronunciation
worker is configured, each saved take gets a readout shaped like this (the
values are illustrative):

```text
78/100  heard “I asked him about the mont”
month  /mʌnθ/ → /mʌnt/  64%
```

## Features

- Live caption and call-audio capture from Google Meet, with both people's
  recorded consent checked at the start of each lesson.
- Per-sentence playback from a single private recording, with 250 ms of padding
  around each caption.
- Six note types (pronunciation, grammar, word choice, filler, interview
  structure, technical), anchored to a whole line or to a word range.
- A study queue scheduled with SM-2, with side-by-side retry recordings for
  pronunciation and filler notes.
- Trends across lessons: words per minute, filler rate, recurring flagged words.
- A mock-interview layer: a question bank, tagged answer segments, and four-part
  rubric feedback.
- An optional lesson analysis that proposes pronunciation notes for the tutor to
  confirm, and an optional phoneme score for each retry take.

## Documentation

- [docs/](docs/README.md) is the manual: one page per workflow.
- [ARCHITECTURE.md](ARCHITECTURE.md) is the code map and data model.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers working on the code.
