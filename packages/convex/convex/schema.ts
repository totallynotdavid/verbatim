import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Broad interview-question buckets. Tags carry the rest. */
export const interviewTopic = v.union(
	v.literal("algorithms"),
	v.literal("system-design"),
	v.literal("behavioral"),
	v.literal("fundamentals"),
);

export const interviewDifficulty = v.union(
	v.literal("easy"),
	v.literal("medium"),
	v.literal("hard"),
);

/** Qualitative rubric levels rather than numeric scores. */
export const rubricRating = v.union(
	v.literal("strong"),
	v.literal("developing"),
	v.literal("needs-work"),
);

/** Feedback for one rubric dimension, which may be left unassessed. */
export const rubricEntry = v.object({
	rating: v.optional(rubricRating),
	note: v.optional(v.string()),
});

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
		// Current consent setting for future sessions.
		standingConsent: v.optional(v.boolean()),
		// Cleared when the invite is redeemed.
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
		// Session start to first audio sample. Seek with startMs - audioOffsetMs.
		audioOffsetMs: v.optional(v.number()),
		// Consent snapshots captured at session start.
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
		// Supports ordered transcript reads for a lesson.
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
		/** `"auto"` marks a tutor-confirmed model suggestion. */
		source: v.optional(v.union(v.literal("tutor"), v.literal("auto"))),
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

	/** Browser recordings of attempts to repeat a flagged phrase. */
	retryRecordings: defineTable({
		reviewCardId: v.id("reviewCards"),
		// The annotation this retry attempts.
		annotationId: v.id("annotations"),
		storageId: v.id("_storage"),
		recordedBy: v.id("users"),
		durationMs: v.number(),
		createdAt: v.number(),
	})
		.index("reviewCardId", ["reviewCardId"])
		.index("annotationId", ["annotationId"]),

	/** Tutor-authored interview questions, independent of a lesson. */
	interviewQuestions: defineTable({
		topic: interviewTopic,
		difficulty: interviewDifficulty,
		prompt: v.string(),
		// Free-form labels complement the topic enum.
		tags: v.array(v.string()),
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	}),

	/** A transcript range tagged with an interview question. */
	interviewSegments: defineTable({
		sessionId: v.id("lessonSessions"),
		questionId: v.id("interviewQuestions"),
		startLineId: v.id("transcriptLines"),
		endLineId: v.id("transcriptLines"),
		// Cached bounds for overlap checks and range rendering.
		startOrder: v.number(),
		endOrder: v.number(),
		createdBy: v.id("users"),
		createdAt: v.number(),
	})
		.index("sessionId", ["sessionId"])
		.index("questionId", ["questionId"]),

	/** Four-dimension feedback attached to an interview segment. */
	interviewRubrics: defineTable({
		segmentId: v.id("interviewSegments"),
		// Denormalized for lesson-scoped reads.
		sessionId: v.id("lessonSessions"),
		structure: rubricEntry,
		conciseness: rubricEntry,
		tradeoffs: rubricEntry,
		vocabulary: rubricEntry,
		authorId: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("segmentId", ["segmentId"])
		.index("sessionId", ["sessionId"]),

	/** A tutor-triggered lesson analysis tracked until the external callback. */
	pronunciationRuns: defineTable({
		sessionId: v.id("lessonSessions"),
		requestedBy: v.id("users"),
		requestedAt: v.number(),
		status: v.union(
			v.literal("queued"),
			v.literal("transcribing"),
			v.literal("scoring"),
			v.literal("complete"),
			v.literal("failed"),
		),
		// Provider id used for tracing and cancellation.
		predictionId: v.optional(v.string()),
		// Large provider output is stored separately from the run row.
		resultStorageId: v.optional(v.id("_storage")),
		wordsRead: v.optional(v.number()),
		suggestionsCreated: v.optional(v.number()),
		error: v.optional(v.string()),
		completedAt: v.optional(v.number()),
	}).index("sessionId", ["sessionId"]),

	/** Model-proposed notes awaiting tutor review. */
	pronunciationSuggestions: defineTable({
		sessionId: v.id("lessonSessions"),
		runId: v.id("pronunciationRuns"),
		transcriptLineId: v.id("transcriptLines"),
		worker: v.union(v.literal("whisperx"), v.literal("openpronounce")),
		note: v.string(),
		// Optional range in immutable transcript text.
		charStart: v.optional(v.number()),
		charEnd: v.optional(v.number()),
		// Model confidence, shown but not edited.
		confidence: v.optional(v.number()),
		status: v.union(
			v.literal("pending"),
			v.literal("confirmed"),
			v.literal("dismissed"),
		),
		// Annotation created when a tutor confirms the suggestion.
		annotationId: v.optional(v.id("annotations")),
		reviewedBy: v.optional(v.id("users")),
		reviewedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("sessionId", ["sessionId"])
		.index("runId", ["runId"])
		.index("transcriptLineId", ["transcriptLineId"]),

	/** Read-only phoneme result for one retry recording. */
	pronunciationScores: defineTable({
		retryRecordingId: v.id("retryRecordings"),
		annotationId: v.id("annotations"),
		sessionId: v.id("lessonSessions"),
		status: v.union(
			v.literal("scoring"),
			v.literal("complete"),
			v.literal("failed"),
		),
		// Exact text used for comparison.
		expectedText: v.string(),
		score: v.optional(v.number()),
		// Transcript produced by the word recognizer.
		transcript: v.optional(v.string()),
		// Highest-priority word errors; full detail is stored separately.
		words: v.optional(
			v.array(
				v.object({
					word: v.string(),
					expected: v.string(),
					heard: v.string(),
					confidence: v.number(),
				}),
			),
		),
		// Full worker response, including fields not shown in the UI.
		detailStorageId: v.optional(v.id("_storage")),
		error: v.optional(v.string()),
		createdAt: v.number(),
		completedAt: v.optional(v.number()),
	}).index("retryRecordingId", ["retryRecordingId"]),
});
