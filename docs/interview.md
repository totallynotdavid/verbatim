# Mock-interview coaching

The second half of a lesson can be a mock interview. Verbatim lets the tutor
keep a bank of questions, tag the part of a transcript that answers one, and
write structured feedback on that answer. None of it needs the extension or a
microphone.

## The question bank

`/dashboard/questions` lists every question, newest first, with the number of
lesson segments that cite it. The tutor can create, edit and delete questions.
The student sees the same list without the controls.

| Field        | Values                                                                |
| ------------ | --------------------------------------------------------------------- |
| `topic`      | `algorithms`, `system-design`, `behavioral`, `fundamentals`           |
| `difficulty` | `easy`, `medium`, `hard`                                              |
| `prompt`     | The question as spoken, at most 2000 characters.                      |
| `tags`       | At most 8 tags of at most 32 characters. Lowercased and deduplicated. |

A question that a segment cites cannot be deleted. The error names how many
segments use it; untag them first. The writes are in
[`interviewQuestions.ts`](../packages/convex/convex/interviewQuestions.ts) and
require `role === "tutor"`.

## Tagging an answer

1. Open a lesson on the **Transcript** tab as the lesson's tutor and drag across
   two or more lines: the question and the answer that follows. A bar under the
   transcript reads "n lines selected" with **Tag as interview answer**.
2. The button opens the bank, filterable by wording, topic or tag. Picking a
   question tags the range.
3. The transcript shows a chip where the segment starts, the lines inside it
   carry a ring, and the **Interview** tab's count goes up.

Segments cannot overlap, because one run of lines answers one question. A tag
that crosses an existing segment is refused. A single-line selection opens the
note composer instead. The pencil on a segment retags it against another
question, and the bin removes the segment and its rubric.

A segment (`interviewSegments`) stores its first and last line ids and the
`order` of each. `order` never changes after a line is written, so the cached
bounds stay valid.
[`interviewSegments.ts`](../packages/convex/convex/interviewSegments.ts) accepts
the bounds in either order and normalizes them.

## Rubric feedback

Open the **Interview** tab. Each segment shows its question, how many lines it
covers, where it starts (click to hear the first line) and its feedback. **Add
feedback** opens four dimensions:

- structure
- conciseness
- tradeoffs
- vocabulary

Each takes a rating, `strong`, `developing` or `needs-work`, and a note of at
most 1000 characters. Clicking the selected rating clears it. A blank dimension
means "not assessed".

`interviewSegments.saveRubric` replaces the whole rubric, so a dimension cleared
in the form is stored empty. A save with nothing in any dimension is refused;
**Remove** (`removeRubric`) is how feedback goes away. A segment has at most one
rubric (`interviewRubrics`), and the student sees every segment and every
dimension read-only.

## Access

| Operation                                   | Who                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Read the bank, segments and rubrics         | Any signed-in user for the bank. Members of the lesson for segments and rubrics. |
| Write questions                             | A signed-in user whose role is `tutor` (`requireTutor`).                         |
| Tag, retag, untag, write or remove a rubric | The lesson's tutor (`requireSessionTutor`).                                      |

See [auth.md](auth.md#who-can-read-and-write-what).

Interview notes are separate from lesson notes. Segments and rubrics are never
`annotations`, so they never create review cards.
