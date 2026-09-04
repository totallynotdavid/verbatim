import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Read-only aggregation across a pair's whole lesson history. Nothing here
 * writes; every number is derived from transcript lines and annotations that
 * already exist.
 */

/** Terms shown in the recurring list, most frequent first. */
const MAX_TERMS = 30;

/** Example lessons kept per term, so a term can be traced back. */
const MAX_OCCURRENCES_PER_TERM = 6;

/** Longer than this is a sentence-length note, not a flagged word or sound. */
const MAX_TERM_LENGTH = 60;

/**
 * A quoted span inside a note: `'th'`, `"much faster"`, `'at my last job'`.
 *
 * The quote has to sit on a word boundary, so the apostrophes in "don't" and
 * "isn't" cannot pair up into a bogus term.
 */
const QUOTED_TERM = /(?<![\p{L}\p{N}])["“‘']([^"”“‘'\n]{1,60})["”’'](?![\p{L}\p{N}])/gu;

function words(text: string): number {
	return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/** Lowercases and strips edge punctuation so "Month." and "month" group together. */
function normalizeTerm(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/^[^\p{L}\p{N}-]+/u, "")
		.replace(/[^\p{L}\p{N}-]+$/u, "");
}

/**
 * The words an annotation flagged.
 *
 * A note anchored to a character range names its own words: that range against
 * the parent line's immutable text is exactly what the tutor underlined.
 *
 * A line-level note has no range, so the note text is the fallback. Tutors
 * quote the phrase they mean ("The 'th' in 'month'"), so quoted spans are
 * pulled out of it when there are any. A note with nothing quoted contributes
 * its own text as a single term, which groups repeats of the same note and
 * nothing else.
 */
function termsFor(
	annotation: Doc<"annotations">,
	line: Doc<"transcriptLines"> | undefined,
): string[] {
	if (
		line !== undefined &&
		annotation.charStart !== undefined &&
		annotation.charEnd !== undefined
	) {
		const anchored = normalizeTerm(
			line.text.slice(annotation.charStart, annotation.charEnd),
		);
		return anchored === "" ? [] : [anchored];
	}

	const quoted = [...annotation.note.matchAll(QUOTED_TERM)]
		.map((match) => normalizeTerm(match[1] ?? ""))
		.filter((term) => term !== "");
	if (quoted.length > 0) {
		return [...new Set(quoted)];
	}

	const whole = normalizeTerm(annotation.note);
	if (whole === "") return [];
	if (whole.length <= MAX_TERM_LENGTH) return [whole];
	// Cut on a word boundary so the label reads as a phrase, not a fragment.
	const cut = whole.slice(0, MAX_TERM_LENGTH);
	const lastSpace = cut.lastIndexOf(" ");
	return [`${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`];
}

type Occurrence = {
	annotationId: Id<"annotations">;
	sessionId: Id<"lessonSessions">;
	sessionStartedAt: number;
	type: Doc<"annotations">["type"];
	note: string;
	lineText: string | null;
	anchored: boolean;
};

export const forCurrentPair = query({
	args: {},
	handler: async (ctx) => {
		const viewerId = await getAuthUserId(ctx);
		if (viewerId === null) return null;
		const viewer = await ctx.db.get(viewerId);
		if (viewer === null || viewer.pairedWithUserId === undefined) return null;
		const partner = await ctx.db.get(viewer.pairedWithUserId);

		const [asTutor, asStudent] = await Promise.all([
			ctx.db
				.query("lessonSessions")
				.withIndex("tutorId", (q) => q.eq("tutorId", viewer._id))
				.collect(),
			ctx.db
				.query("lessonSessions")
				.withIndex("studentId", (q) => q.eq("studentId", viewer._id))
				.collect(),
		]);
		// Oldest first: these series read left to right as lesson history.
		const sessions = [...asTutor, ...asStudent].sort(
			(a, b) => a.startedAt - b.startedAt,
		);

		const terms = new Map<
			string,
			{
				display: string;
				count: number;
				sessions: Set<string>;
				types: Set<string>;
				lastSeenAt: number;
				anchoredCount: number;
				occurrences: Occurrence[];
			}
		>();

		const perSession = await Promise.all(
			sessions.map(async (session) => {
				const [lines, annotations] = await Promise.all([
					ctx.db
						.query("transcriptLines")
						.withIndex("sessionId_order", (q) => q.eq("sessionId", session._id))
						.collect(),
					ctx.db
						.query("annotations")
						.withIndex("sessionId", (q) => q.eq("sessionId", session._id))
						.collect(),
				]);
				lines.sort((a, b) => a.order - b.order);
				const byId = new Map(lines.map((line) => [line._id, line]));

				let totalWords = 0;
				let studentWords = 0;
				let lastEndMs = 0;
				for (const line of lines) {
					const count = words(line.text);
					totalWords += count;
					if (line.speakerId === session.studentId) studentWords += count;
					if (line.endMs > lastEndMs) lastEndMs = line.endMs;
				}

				/*
				 * Speaking span, not wall-clock span. Line timestamps share their
				 * origin with the session's start, so the last caption's `endMs` is
				 * the time from "lesson started" to "the last thing anyone said".
				 *
				 * The wall-clock `endedAt - startedAt` also contains whatever happened
				 * after that: goodbyes off-camera, a tab left open, a late Stop. That
				 * is dead air, and it drags words-per-minute down without anyone
				 * having spoken more slowly. Lessons with no captions have no words
				 * to rate anyway, so the wall-clock fallback only ever backs an empty
				 * transcript.
				 */
				const spanMs =
					lastEndMs > 0
						? lastEndMs
						: session.endedAt === undefined
							? 0
							: session.endedAt - session.startedAt;

				const byType: Record<string, number> = {};
				for (const annotation of annotations) {
					byType[annotation.type] = (byType[annotation.type] ?? 0) + 1;

					const line = byId.get(annotation.transcriptLineId);
					const anchored =
						annotation.charStart !== undefined &&
						annotation.charEnd !== undefined;
					for (const term of termsFor(annotation, line)) {
						const entry = terms.get(term) ?? {
							display: term,
							count: 0,
							sessions: new Set<string>(),
							types: new Set<string>(),
							lastSeenAt: 0,
							anchoredCount: 0,
							occurrences: [],
						};
						entry.count += 1;
						entry.sessions.add(session._id);
						entry.types.add(annotation.type);
						entry.lastSeenAt = Math.max(entry.lastSeenAt, annotation.createdAt);
						if (anchored) entry.anchoredCount += 1;
						if (entry.occurrences.length < MAX_OCCURRENCES_PER_TERM) {
							entry.occurrences.push({
								annotationId: annotation._id,
								sessionId: session._id,
								sessionStartedAt: session.startedAt,
								type: annotation.type,
								note: annotation.note,
								lineText: line?.text ?? null,
								anchored,
							});
						}
						terms.set(term, entry);
					}
				}

				const fillerCount = byType.filler ?? 0;
				return {
					_id: session._id,
					startedAt: session.startedAt,
					status: session.status,
					spanMs,
					lineCount: lines.length,
					totalWords,
					studentWords,
					wordsPerMinute:
						spanMs > 0 && totalWords > 0
							? (totalWords / spanMs) * 60_000
							: null,
					annotationCount: annotations.length,
					annotationsByType: byType,
					fillerCount,
					// Per 100 words rather than per minute: it is a habit of speech,
					// so it should not look better simply because the lesson was slow.
					fillerPer100Words:
						totalWords > 0 ? (fillerCount / totalWords) * 100 : null,
				};
			}),
		);

		const recurring = [...terms.entries()]
			.map(([term, entry]) => ({
				term,
				display: entry.display,
				count: entry.count,
				sessionCount: entry.sessions.size,
				types: [...entry.types],
				lastSeenAt: entry.lastSeenAt,
				anchoredCount: entry.anchoredCount,
				occurrences: entry.occurrences,
			}))
			.sort(
				(a, b) =>
					b.count - a.count ||
					b.sessionCount - a.sessionCount ||
					b.lastSeenAt - a.lastSeenAt,
			)
			.slice(0, MAX_TERMS);

		const withTranscript = perSession.filter((s) => s.totalWords > 0);
		return {
			student:
				viewer.role === "student"
					? { _id: viewer._id, name: viewer.name ?? null }
					: partner === null
						? null
						: { _id: partner._id, name: partner.name ?? null },
			viewerRole: viewer.role ?? null,
			sessions: perSession,
			recurring,
			totals: {
				sessionCount: perSession.length,
				lessonsWithTranscript: withTranscript.length,
				annotationCount: perSession.reduce(
					(sum, session) => sum + session.annotationCount,
					0,
				),
				totalWords: perSession.reduce(
					(sum, session) => sum + session.totalWords,
					0,
				),
				fillerCount: perSession.reduce(
					(sum, session) => sum + session.fillerCount,
					0,
				),
			},
		};
	},
});
