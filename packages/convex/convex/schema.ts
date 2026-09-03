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
		// User-level consent. Sessions snapshot it when they start.
		standingConsent: v.optional(v.boolean()),
		// Present while an invite is available. Cleared when the invite is redeemed.
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
		// Delay from the session clock's origin to the first audio sample. Seek a
		// line at startMs with startMs - audioOffsetMs.
		audioOffsetMs: v.optional(v.number()),
		// Snapshot of each user's consent when the session starts.
		consentTutor: v.boolean(),
		consentStudent: v.boolean(),
	})
		.index("tutorId", ["tutorId"])
		.index("studentId", ["studentId"]),

	transcriptLines: defineTable({
		sessionId: v.id("lessonSessions"),
		// Meet exposes a display name, so resolve the account only on an exact match.
		speakerId: v.optional(v.id("users")),
		// Preserve the display name when the account cannot be resolved.
		speakerLabel: v.optional(v.string()),
		text: v.string(),
		startMs: v.number(),
		endMs: v.number(),
		order: v.number(),
	})
		.index("sessionId", ["sessionId"])
		// The pair of fields makes retried line uploads idempotent.
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
		authorId: v.id("users"),
		createdAt: v.number(),
	})
		.index("sessionId", ["sessionId"])
		.index("transcriptLineId", ["transcriptLineId"]),

	reviewCards: defineTable({
		sessionId: v.id("lessonSessions"),
		sourceAnnotationId: v.id("annotations"),
		dueAt: v.number(),
		interval: v.number(),
		ease: v.number(),
	})
		.index("sessionId", ["sessionId"])
		.index("dueAt", ["dueAt"]),
});
