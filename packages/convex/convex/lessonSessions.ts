import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalQuery,
	mutation,
	query,
	type QueryCtx,
} from "./_generated/server";
import {
	authorizeStoredFile,
	LESSON_AUDIO_PATH,
	loadParticipants,
	requireCurrentUser,
	requireOwnSession,
	type StoredFileTarget,
} from "./model/sessions";

async function requirePairedUser(ctx: QueryCtx): Promise<{
	user: Doc<"users">;
	partner: Doc<"users">;
}> {
	const user = await requireCurrentUser(ctx);
	if (user.pairedWithUserId === undefined) {
		throw new Error("Not paired with a tutor/student yet");
	}
	const partner = await ctx.db.get(user.pairedWithUserId);
	if (partner === null) {
		throw new Error("Paired user no longer exists");
	}
	return { user, partner };
}

/**
 * Returns the current pair's sessions, most recent first.
 *
 * Count annotations without loading transcript lines, so list cost follows
 * note count rather than transcript length.
 */
export const listForCurrentPair = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			return [];
		}
		const user = await ctx.db.get(userId);
		if (user === null || user.pairedWithUserId === undefined) {
			return [];
		}
		const partner = await ctx.db.get(user.pairedWithUserId);

		const [asTutor, asStudent] = await Promise.all([
			ctx.db
				.query("lessonSessions")
				.withIndex("tutorId", (q) => q.eq("tutorId", user._id))
				.collect(),
			ctx.db
				.query("lessonSessions")
				.withIndex("studentId", (q) => q.eq("studentId", user._id))
				.collect(),
		]);

		const sessions = [...asTutor, ...asStudent].sort(
			(a, b) => b.startedAt - a.startedAt,
		);

		return Promise.all(
			sessions.map(async (session) => {
				const annotations = await ctx.db
					.query("annotations")
					.withIndex("sessionId", (q) => q.eq("sessionId", session._id))
					.collect();

				return {
					_id: session._id,
					startedAt: session.startedAt,
					endedAt: session.endedAt ?? null,
					status: session.status,
					hasAudio: session.audioStorageId !== undefined,
					audioDurationMs: session.audioDurationMs ?? null,
					annotationCount: annotations.length,
					partnerName: partner?.name ?? null,
					viewerRole: session.tutorId === user._id ? "tutor" : "student",
				};
			}),
		);
	},
});

/**
 * Returns the review data for one session.
 *
 * Auth that is still resolving returns `null`. An existing unauthorized
 * session raises an authorization error.
 */
export const getReview = query({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args) => {
		const viewerId = await getAuthUserId(ctx);
		if (viewerId === null) {
			return null;
		}

		const { session } = await requireOwnSession(ctx, args.sessionId);
		const { tutor, student } = await loadParticipants(ctx, session);

		const [lines, annotations, segments, rubrics] = await Promise.all([
			ctx.db
				.query("transcriptLines")
				.withIndex("sessionId_order", (q) => q.eq("sessionId", session._id))
				.collect(),
			ctx.db
				.query("annotations")
				.withIndex("sessionId", (q) => q.eq("sessionId", session._id))
				.collect(),
			ctx.db
				.query("interviewSegments")
				.withIndex("sessionId", (q) => q.eq("sessionId", session._id))
				.collect(),
			ctx.db
				.query("interviewRubrics")
				.withIndex("sessionId", (q) => q.eq("sessionId", session._id))
				.collect(),
		]);

		// Return transcript lines in order regardless of query ordering.
		lines.sort((a, b) => a.order - b.order);
		// Non-overlapping segments can be ordered by their start.
		segments.sort((a, b) => a.startOrder - b.startOrder);

		const rubricBySegment = new Map(
			rubrics.map((rubric) => [rubric.segmentId, rubric]),
		);
		// Avoid refetching questions reused by multiple segments.
		const questionIds = [...new Set(segments.map((s) => s.questionId))];
		const questionById = new Map(
			(await Promise.all(questionIds.map((id) => ctx.db.get(id))))
				.filter((question) => question !== null)
				.map((question) => [question._id, question]),
		);

		const nameFor = (userId: Doc<"users">["_id"] | undefined) => {
			if (userId === undefined) return null;
			if (userId === tutor?._id) return tutor?.name ?? null;
			if (userId === student?._id) return student?.name ?? null;
			return null;
		};

		// The route reauthorizes access on each request. Do not expose a storage URL.
		const storageId = session.audioStorageId;
		let audio: {
			url: string;
			durationMs: number | null;
			offsetMs: number;
			contentType: string | null;
			sizeBytes: number | null;
		} | null = null;
		if (storageId !== undefined) {
			const metadata = await ctx.db.system.get(storageId);
			audio = {
				url: `${process.env.CONVEX_SITE_URL}${LESSON_AUDIO_PATH}?sessionId=${session._id}`,
				// Session metadata is authoritative because WebM may omit duration.
				durationMs: session.audioDurationMs ?? null,
				offsetMs: session.audioOffsetMs ?? 0,
				contentType: metadata?.contentType ?? null,
				sizeBytes: metadata?.size ?? null,
			};
		}

		return {
			session: {
				_id: session._id,
				startedAt: session.startedAt,
				endedAt: session.endedAt ?? null,
				status: session.status,
				tutorId: session.tutorId,
				studentId: session.studentId,
				tutorName: tutor?.name ?? null,
				studentName: student?.name ?? null,
				viewerId,
				viewerRole: session.tutorId === viewerId ? "tutor" : "student",
			},
			audio,
			lines: lines.map((line) => ({
				_id: line._id,
				speakerId: line.speakerId ?? null,
				speakerLabel: line.speakerLabel ?? null,
				speakerName: nameFor(line.speakerId) ?? line.speakerLabel ?? null,
				text: line.text,
				startMs: line.startMs,
				endMs: line.endMs,
				order: line.order,
			})),
			annotations: annotations
				.map((annotation) => ({
					_id: annotation._id,
					transcriptLineId: annotation.transcriptLineId,
					type: annotation.type,
					note: annotation.note,
					charStart: annotation.charStart ?? null,
					charEnd: annotation.charEnd ?? null,
					authorId: annotation.authorId,
					authorName: nameFor(annotation.authorId),
					isOwn: annotation.authorId === viewerId,
					createdAt: annotation.createdAt,
				}))
				.sort((a, b) => a.createdAt - b.createdAt),
			interviewSegments: segments.map((segment) => {
				const question = questionById.get(segment.questionId) ?? null;
				const rubric = rubricBySegment.get(segment._id) ?? null;
				return {
					_id: segment._id,
					questionId: segment.questionId,
					question:
						question === null
							? null
							: {
									_id: question._id,
									topic: question.topic,
									difficulty: question.difficulty,
									prompt: question.prompt,
									tags: question.tags,
								},
					startLineId: segment.startLineId,
					endLineId: segment.endLineId,
					startOrder: segment.startOrder,
					endOrder: segment.endOrder,
					createdAt: segment.createdAt,
					rubric:
						rubric === null
							? null
							: {
									_id: rubric._id,
									structure: rubric.structure,
									conciseness: rubric.conciseness,
									tradeoffs: rubric.tradeoffs,
									vocabulary: rubric.vocabulary,
									authorName: nameFor(rubric.authorId),
									updatedAt: rubric.updatedAt,
								},
				};
			}),
		};
	},
});

/**
 * Authorizes a lesson-audio request and returns a result the HTTP route can map
 * to a status code. String input lets malformed URL ids return 404.
 */
export const audioRequestTarget = internalQuery({
	args: {
		sessionId: v.string(),
	},
	handler: async (ctx, args): Promise<StoredFileTarget> =>
		authorizeStoredFile(ctx, async () => {
			const sessionId: Id<"lessonSessions"> | null = ctx.db.normalizeId(
				"lessonSessions",
				args.sessionId,
			);
			if (sessionId === null) return null;
			const session = await ctx.db.get(sessionId);
			if (session === null) return null;
			return { session, storageId: session.audioStorageId };
		}),
});

/** Checks both users' current consent before creating a session. */
export const startSession = mutation({
	args: {},
	handler: async (ctx) => {
		const { user, partner } = await requirePairedUser(ctx);

		if (user.role === undefined || partner.role === undefined) {
			throw new Error("Both users must have a role set");
		}
		if (user.role === partner.role) {
			throw new Error("A lesson session needs one tutor and one student");
		}

		const tutor = user.role === "tutor" ? user : partner;
		const student = user.role === "student" ? user : partner;

		const consentTutor = tutor.standingConsent ?? false;
		const consentStudent = student.standingConsent ?? false;
		if (!consentTutor || !consentStudent) {
			throw new Error(
				"Both tutor and student must have standing consent to recording before a session can start",
			);
		}

		return ctx.db.insert("lessonSessions", {
			tutorId: tutor._id,
			studentId: student._id,
			startedAt: Date.now(),
			status: "recording",
			consentTutor,
			consentStudent,
		});
	},
});

export const finishCapture = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args) => {
		const { session } = await requireOwnSession(ctx, args.sessionId);
		// Repeated stops should be harmless.
		if (session.status !== "recording") {
			return session.status;
		}

		await ctx.db.patch(session._id, {
			endedAt: Date.now(),
			status: "processing",
		});
		return "processing" as const;
	},
});

export const generateAudioUploadUrl = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args) => {
		await requireOwnSession(ctx, args.sessionId);
		return ctx.storage.generateUploadUrl();
	},
});

export const attachAudio = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
		storageId: v.id("_storage"),
		durationMs: v.number(),
		offsetMs: v.number(),
	},
	handler: async (ctx, args) => {
		const { session } = await requireOwnSession(ctx, args.sessionId);
		if (session.status === "recording") {
			throw new Error(
				"Lesson session is still recording; finish capture before attaching audio",
			);
		}

		// Delete the old upload when replacing it.
		if (
			session.audioStorageId !== undefined &&
			session.audioStorageId !== args.storageId
		) {
			await ctx.storage.delete(session.audioStorageId);
		}

		await ctx.db.patch(session._id, {
			audioStorageId: args.storageId,
			audioDurationMs: args.durationMs,
			audioOffsetMs: args.offsetMs,
			endedAt: session.endedAt ?? Date.now(),
			status: "ready",
		});
		return "ready" as const;
	},
});

export const finishWithoutAudio = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args) => {
		const { session } = await requireOwnSession(ctx, args.sessionId);
		if (session.status === "recording") {
			throw new Error(
				"Lesson session is still recording; finish capture first",
			);
		}
		if (session.status === "ready") {
			return session.status;
		}
		await ctx.db.patch(session._id, {
			endedAt: session.endedAt ?? Date.now(),
			status: "incomplete",
		});
		return "incomplete" as const;
	},
});
