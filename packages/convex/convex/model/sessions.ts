import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Shared authorization helpers for lesson sessions. */

/** Path used by the authenticated lesson-audio route. */
export const LESSON_AUDIO_PATH = "/lessonAudio";

/** Path used by the authenticated retry-recording route. */
export const RETRY_AUDIO_PATH = "/retryAudio";

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

/** The single membership rule every session-scoped resource is checked against. */
export function isSessionMember(
	session: Doc<"lessonSessions">,
	userId: Id<"users">,
): boolean {
	return session.tutorId === userId || session.studentId === userId;
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
	if (!isSessionMember(session, userId)) {
		throw new Error("That lesson session belongs to someone else");
	}
	return { session, userId };
}

/** Requires a signed-in tutor for content outside a lesson. */
export async function requireTutor(ctx: QueryCtx): Promise<Doc<"users">> {
	const user = await requireCurrentUser(ctx);
	if (user.role !== "tutor") {
		throw new Error("Only the tutor can do that");
	}
	return user;
}

/** Requires the signed-in user to be the tutor for this lesson. */
export async function requireSessionTutor(
	ctx: QueryCtx,
	sessionId: Id<"lessonSessions">,
): Promise<{ session: Doc<"lessonSessions">; userId: Id<"users"> }> {
	const { session, userId } = await requireOwnSession(ctx, sessionId);
	if (session.tutorId !== userId) {
		throw new Error("Only the tutor of this lesson can do that");
	}
	return { session, userId };
}

export type StoredFileTarget =
	| { ok: true; storageId: Id<"_storage">; contentType: string | null }
	| { ok: false; reason: "unauthenticated" | "forbidden" | "not-found" };

/**
 * Reauthorizes a stored file that a lesson session guards.
 *
 * Every private-audio route needs the same steps: resolve the caller, find the
 * session that owns the bytes, check membership. Only the walk from a URL
 * parameter to a session and a storage id differs, and that walk is `locate`,
 * so the membership rule stays written once.
 *
 * `locate` runs only after authentication. Returning null from it means "not
 * found" without saying whether the row exists.
 */
export async function authorizeStoredFile(
	ctx: QueryCtx,
	locate: () => Promise<{
		session: Doc<"lessonSessions">;
		storageId: Id<"_storage"> | undefined;
	} | null>,
): Promise<StoredFileTarget> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) {
		return { ok: false, reason: "unauthenticated" };
	}

	const located = await locate();
	if (located === null) {
		return { ok: false, reason: "not-found" };
	}
	if (!isSessionMember(located.session, userId)) {
		// Return 403 only after authentication, without exposing membership.
		return { ok: false, reason: "forbidden" };
	}
	if (located.storageId === undefined) {
		return { ok: false, reason: "not-found" };
	}

	const metadata = await ctx.db.system.get(located.storageId);
	return {
		ok: true,
		storageId: located.storageId,
		contentType: metadata?.contentType ?? null,
	};
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

/**
 * Loads a review card together with the lesson that authorizes it.
 *
 * A card is only ever reachable through its session, so this is
 * `requireOwnSession` with one extra hop rather than a second rule.
 */
export async function requireOwnReviewCard(
	ctx: QueryCtx,
	reviewCardId: Id<"reviewCards">,
): Promise<{
	card: Doc<"reviewCards">;
	session: Doc<"lessonSessions">;
	userId: Id<"users">;
}> {
	const card = await ctx.db.get(reviewCardId);
	if (card === null) {
		throw new Error("Review card not found");
	}
	const { session, userId } = await requireOwnSession(ctx, card.sessionId);
	return { card, session, userId };
}
