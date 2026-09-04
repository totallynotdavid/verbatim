import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	...authTables,

	users: defineTable({
		name: v.optional(v.string()),
		image: v.optional(v.string()),
		email: v.optional(v.string()),
		emailVerificationTime: v.optional(v.number()),
		phone: v.optional(v.string()),
		phoneVerificationTime: v.optional(v.number()),
		isAnonymous: v.optional(v.boolean()),

		googleSub: v.optional(v.string()),
		role: v.optional(v.union(v.literal("tutor"), v.literal("student"))),
		pairedWithUserId: v.optional(v.id("users")),
		// User consent captured when a session starts.
		standingConsent: v.optional(v.boolean()),
		// Present while an invite can be redeemed.
		pairingInviteCode: v.optional(v.string()),
	})
		.index("email", ["email"])
		.index("googleSub", ["googleSub"])
		.index("pairingInviteCode", ["pairingInviteCode"]),

	lessonSessions: defineTable({
		tutorId: v.id("users"),
		studentId: v.id("users"),
		startedAt: v.number(),
		endedAt: v.optional(v.number()),
		status: v.union(
			v.literal("recording"),
			v.literal("processing"),
			v.literal("ready"),
			v.literal("incomplete"),
		),
		audioStorageId: v.optional(v.id("_storage")),
		audioDurationMs: v.optional(v.number()),
		// Delay from session start to the first audio sample. Seek with
		// startMs - audioOffsetMs.
		audioOffsetMs: v.optional(v.number()),
		// Consent values captured when the session starts.
		consentTutor: v.boolean(),
		consentStudent: v.boolean(),
	})
		.index("tutorId", ["tutorId"])
		.index("studentId", ["studentId"]),

	transcriptLines: defineTable({
		sessionId: v.id("lessonSessions"),
		// Set only when the Meet name exactly matches a participant.
		speakerId: v.optional(v.id("users")),
		// Preserve the Meet name when it does not resolve to an account.
		speakerLabel: v.optional(v.string()),
		text: v.string(),
		startMs: v.number(),
		endMs: v.number(),
		order: v.number(),
	})
		.index("sessionId", ["sessionId"])
		// Retries use session and order as the stable key.
		.index("sessionId_order", ["sessionId", "order"]),

	annotations: defineTable({
		sessionId: v.id("lessonSessions"),
		transcriptLineId: v.id("transcriptLines"),
		type: v.union(
			v.literal("pronunciation"),
			v.literal("grammar"),
			v.literal("word-choice"),
			v.literal("filler"),
			v.literal("interview-structure"),
			v.literal("technical"),
		),
		note: v.string(),
		// Optional range in immutable line text. Omit it for a line-level note.
		charStart: v.optional(v.number()),
		charEnd: v.optional(v.number()),
		authorId: v.id("users"),
		createdAt: v.number(),
	})
		.index("sessionId", ["sessionId"])
		.index("transcriptLineId", ["transcriptLineId"]),

	reviewCards: defineTable({
		sessionId: v.id("lessonSessions"),
		sourceAnnotationId: v.id("annotations"),
		// Whose cards these are. Both members of a pair read the queue.
		studentId: v.id("users"),
		dueAt: v.number(),
		// SM-2 state. `interval` is in days; 0 marks a card never reviewed.
		interval: v.number(),
		ease: v.number(),
		repetitions: v.number(),
		lapses: v.number(),
		lastReviewedAt: v.optional(v.number()),
		lastGrade: v.optional(v.number()),
	})
		.index("sessionId", ["sessionId"])
		.index("sourceAnnotationId", ["sourceAnnotationId"])
		// The queue reads one learner's cards in due order.
		.index("studentId_dueAt", ["studentId", "dueAt"]),

	/**
	 * A student saying a flagged word or sentence again, recorded in the
	 * browser. Stored per attempt rather than spliced into the lesson audio, so
	 * the original recording stays the immutable record of the lesson.
	 */
	retryRecordings: defineTable({
		reviewCardId: v.id("reviewCards"),
		// The note this take is an attempt at, so its expected text is
		// reachable without going through the card.
		annotationId: v.id("annotations"),
		storageId: v.id("_storage"),
		recordedBy: v.id("users"),
		durationMs: v.number(),
		createdAt: v.number(),
	})
		.index("reviewCardId", ["reviewCardId"])
		.index("annotationId", ["annotationId"]),
});
