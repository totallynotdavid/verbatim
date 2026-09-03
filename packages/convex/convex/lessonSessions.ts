import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";

async function requirePairedUser(ctx: QueryCtx): Promise<{
	user: Doc<"users">;
	partner: Doc<"users">;
}> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) {
		throw new Error("Not signed in");
	}
	const user = await ctx.db.get(userId);
	if (user === null) {
		throw new Error("Signed-in user no longer exists");
	}
	if (user.pairedWithUserId === undefined) {
		throw new Error("Not paired with a tutor/student yet");
	}
	const partner = await ctx.db.get(user.pairedWithUserId);
	if (partner === null) {
		throw new Error("Paired user no longer exists");
	}
	return { user, partner };
}

/** Enforces ownership before a session is read or changed. */
async function requireOwnSession(
	ctx: QueryCtx,
	sessionId: Id<"lessonSessions">,
): Promise<Doc<"lessonSessions">> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) {
		throw new Error("Not signed in");
	}
	const session = await ctx.db.get(sessionId);
	if (session === null) {
		throw new Error("Lesson session not found");
	}
	if (session.tutorId !== userId && session.studentId !== userId) {
		throw new Error("That lesson session belongs to someone else");
	}
	return session;
}

/** Returns the current user's sessions, most recent first. */
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

		return [...asTutor, ...asStudent].sort((a, b) => b.startedAt - a.startedAt);
	},
});

/**
 * Enforces consent at the session boundary. Both users' current settings are
 * read server-side, so clients cannot supply consent values.
 */
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

/** Moves text capture to processing while audio is attached. */
export const finishCapture = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args) => {
		const session = await requireOwnSession(ctx, args.sessionId);
		// Make repeated stops idempotent.
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

/** Creates a short-lived upload URL for one recording attempt. */
export const generateAudioUploadUrl = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args) => {
		await requireOwnSession(ctx, args.sessionId);
		return ctx.storage.generateUploadUrl();
	},
});

/** Attaches audio and marks the session ready. */
export const attachAudio = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
		storageId: v.id("_storage"),
		durationMs: v.number(),
		offsetMs: v.number(),
	},
	handler: async (ctx, args) => {
		const session = await requireOwnSession(ctx, args.sessionId);
		if (session.status === "recording") {
			throw new Error(
				"Lesson session is still recording; finish capture before attaching audio",
			);
		}

		// Remove the previous upload when a retry replaces it.
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

/** Closes a session whose transcript has no recording. */
export const finishWithoutAudio = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
	},
	handler: async (ctx, args) => {
		const session = await requireOwnSession(ctx, args.sessionId);
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
