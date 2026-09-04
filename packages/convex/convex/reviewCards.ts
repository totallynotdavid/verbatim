import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	mutation,
	query,
	type QueryCtx,
} from "./_generated/server";
import { createForAnnotation, cardForAnnotation } from "./model/reviewCards";
import {
	LESSON_AUDIO_PATH,
	RETRY_AUDIO_PATH,
	requireOwnReviewCard,
} from "./model/sessions";
import { applyReview, type Grade } from "./model/scheduling";

/** SM-2 accepts 0-5. Failures are 0-2, passes are 3-5. */
const gradeValidator = v.union(
	v.literal(0),
	v.literal(1),
	v.literal(2),
	v.literal(3),
	v.literal(4),
	v.literal(5),
);

/** Horizon, in days, for the count of cards due soon. */
const UPCOMING_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

/** Resolves the learner whose queue the caller sees. */
async function queueOwner(ctx: QueryCtx): Promise<Id<"users"> | null> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) return null;
	const user = await ctx.db.get(userId);
	if (user === null) return null;
	if (user.role === "student") return user._id;
	return user.pairedWithUserId ?? null;
}

/** Returns a take's read-only worker score, if one exists. */
async function scoreForRetry(
	ctx: QueryCtx,
	retryRecordingId: Id<"retryRecordings">,
) {
	const score = await ctx.db
		.query("pronunciationScores")
		.withIndex("retryRecordingId", (q) =>
			q.eq("retryRecordingId", retryRecordingId),
		)
		.unique();
	if (score === null) return null;
	return {
		status: score.status,
		expectedText: score.expectedText,
		score: score.score ?? null,
		transcript: score.transcript ?? null,
		words: score.words ?? [],
		error: score.error ?? null,
	};
}

async function retriesForCard(
	ctx: QueryCtx,
	reviewCardId: Id<"reviewCards">,
) {
	const retries = await ctx.db
		.query("retryRecordings")
		.withIndex("reviewCardId", (q) => q.eq("reviewCardId", reviewCardId))
		.collect();

	return Promise.all(
		retries
			.sort((a, b) => a.createdAt - b.createdAt)
			.map(async (retry) => ({
				_id: retry._id,
				// Reauthorized on every request. A storage URL cannot be revoked.
				url: `${process.env.CONVEX_SITE_URL}${RETRY_AUDIO_PATH}?retryId=${retry._id}`,
				durationMs: retry.durationMs,
				createdAt: retry.createdAt,
				recordedBy: retry.recordedBy,
				pronunciation: await scoreForRetry(ctx, retry._id),
			})),
	);
}

/** Caches repeated session and user reads within one queue query. */
type Lookups = {
	sessions: Map<string, Doc<"lessonSessions"> | null>;
	users: Map<string, Doc<"users"> | null>;
};

async function cached<T>(
	store: Map<string, T | null>,
	key: string,
	load: () => Promise<T | null>,
): Promise<T | null> {
	const hit = store.get(key);
	if (hit !== undefined) return hit;
	const value = await load();
	store.set(key, value);
	return value;
}

async function hydrate(
	ctx: QueryCtx,
	card: Doc<"reviewCards">,
	lookups: Lookups,
) {
	const annotation = await ctx.db.get(card.sourceAnnotationId);
	if (annotation === null) return null;
	const line = await ctx.db.get(annotation.transcriptLineId);
	if (line === null) return null;
	const session = await cached(lookups.sessions, card.sessionId, () =>
		ctx.db.get(card.sessionId),
	);
	if (session === null) return null;

	const [tutor, student, author] = await Promise.all([
		cached(lookups.users, session.tutorId, () => ctx.db.get(session.tutorId)),
		cached(lookups.users, session.studentId, () =>
			ctx.db.get(session.studentId),
		),
		cached(lookups.users, annotation.authorId, () =>
			ctx.db.get(annotation.authorId),
		),
	]);

	const speakerName =
		line.speakerId === session.tutorId
			? (tutor?.name ?? null)
			: line.speakerId === session.studentId
				? (student?.name ?? null)
				: null;

	return {
		_id: card._id,
		dueAt: card.dueAt,
		interval: card.interval,
		ease: card.ease,
		repetitions: card.repetitions,
		lapses: card.lapses,
		lastReviewedAt: card.lastReviewedAt ?? null,
		lastGrade: card.lastGrade ?? null,
		annotation: {
			_id: annotation._id,
			type: annotation.type,
			note: annotation.note,
			charStart: annotation.charStart ?? null,
			charEnd: annotation.charEnd ?? null,
			authorName: author?.name ?? null,
			// Legacy notes have no source, so treat them as tutor-written.
			source: annotation.source ?? "tutor",
			createdAt: annotation.createdAt,
		},
		line: {
			_id: line._id,
			text: line.text,
			startMs: line.startMs,
			endMs: line.endMs,
			speakerName: speakerName ?? line.speakerLabel ?? null,
		},
		session: {
			_id: session._id,
			startedAt: session.startedAt,
			// A card's clip comes out of its own lesson recording, so the review
			// surface loads one file at a time rather than all of them at once.
			audio:
				session.audioStorageId === undefined
					? null
					: {
							url: `${process.env.CONVEX_SITE_URL}${LESSON_AUDIO_PATH}?sessionId=${session._id}`,
							durationMs: session.audioDurationMs ?? null,
							offsetMs: session.audioOffsetMs ?? 0,
						},
		},
		retries: await retriesForCard(ctx, card._id),
	};
}

/** Returns the pair's due cards, or null while authentication is unresolved. */
export const queue = query({
	args: {},
	handler: async (ctx) => {
		const studentId = await queueOwner(ctx);
		if (studentId === null) return null;

		const now = Date.now();
		const [due, ahead] = await Promise.all([
			ctx.db
				.query("reviewCards")
				.withIndex("studentId_dueAt", (q) =>
					q.eq("studentId", studentId).lte("dueAt", now),
				)
				.collect(),
			ctx.db
				.query("reviewCards")
				.withIndex("studentId_dueAt", (q) =>
					q.eq("studentId", studentId).gt("dueAt", now),
				)
				.collect(),
		]);

		const lookups: Lookups = { sessions: new Map(), users: new Map() };
		const cards = (
			await Promise.all(due.map((card) => hydrate(ctx, card, lookups)))
		)
			.filter((card) => card !== null)
			.sort((a, b) => a.dueAt - b.dueAt || a.line.startMs - b.line.startMs);

		const horizon = now + UPCOMING_WINDOW_DAYS * DAY_MS;
		return {
			now,
			cards,
			upcoming: {
				total: ahead.length,
				withinWeek: ahead.filter((card) => card.dueAt <= horizon).length,
				nextDueAt:
					ahead.length === 0
						? null
						: ahead.reduce(
								(soonest, card) => Math.min(soonest, card.dueAt),
								Number.POSITIVE_INFINITY,
							),
			},
		};
	},
});

/** Records an SM-2 grade and reschedules the card. The grade is its only input. */
export const grade = mutation({
	args: {
		reviewCardId: v.id("reviewCards"),
		grade: gradeValidator,
	},
	handler: async (ctx, args) => {
		const { card } = await requireOwnReviewCard(ctx, args.reviewCardId);
		const now = Date.now();
		const next = applyReview(card, args.grade as Grade, now);

		await ctx.db.patch(card._id, {
			...next,
			lastReviewedAt: now,
			lastGrade: args.grade,
		});
		return next;
	},
});

/** Creates missing cards for existing annotations; safe to run repeatedly. */
export const backfill = internalMutation({
	args: {},
	handler: async (ctx) => {
		const annotations = await ctx.db.query("annotations").collect();

		let created = 0;
		let skipped = 0;
		for (const annotation of annotations) {
			if ((await cardForAnnotation(ctx, annotation._id)) !== null) {
				skipped++;
				continue;
			}
			const session = await ctx.db.get(annotation.sessionId);
			if (session === null) {
				skipped++;
				continue;
			}
			await createForAnnotation(ctx, {
				annotationId: annotation._id,
				session,
				// Backfilled cards are due immediately, like a note written today.
				now: Date.now(),
			});
			created++;
		}
		return { created, skipped };
	},
});
