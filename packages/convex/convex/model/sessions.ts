import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Shared authorization helpers for lesson sessions. */

/** Path used by the authenticated lesson-audio route. */
export const LESSON_AUDIO_PATH = "/lessonAudio";

export async function requireCurrentUser(ctx: QueryCtx): Promise<Doc<"users">> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) {
		throw new Error("Not signed in");
	}
	const user = await ctx.db.get(userId);
	if (user === null) {
		throw new Error("Signed-in user no longer exists");
	}
	return user;
}

export async function requireOwnSession(
	ctx: QueryCtx,
	sessionId: Id<"lessonSessions">,
): Promise<{ session: Doc<"lessonSessions">; userId: Id<"users"> }> {
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
	return { session, userId };
}

export async function loadParticipants(
	ctx: QueryCtx,
	session: Doc<"lessonSessions">,
): Promise<{ tutor: Doc<"users"> | null; student: Doc<"users"> | null }> {
	const [tutor, student] = await Promise.all([
		ctx.db.get(session.tutorId),
		ctx.db.get(session.studentId),
	]);
	return { tutor, student };
}
