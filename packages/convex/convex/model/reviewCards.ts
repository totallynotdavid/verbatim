import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { newCardState } from "./scheduling";
import { deleteScoreForRetry } from "./scoring";

/** Review cards and retries are derived from annotations and deleted with them. */

export async function createForAnnotation(
	ctx: MutationCtx,
	{
		annotationId,
		session,
		now,
	}: {
		annotationId: Id<"annotations">;
		session: Doc<"lessonSessions">;
		now: number;
	},
): Promise<Id<"reviewCards">> {
	return ctx.db.insert("reviewCards", {
		sessionId: session._id,
		sourceAnnotationId: annotationId,
		studentId: session.studentId,
		...newCardState(now),
	});
}

export async function cardForAnnotation(
	ctx: QueryCtx,
	annotationId: Id<"annotations">,
): Promise<Doc<"reviewCards"> | null> {
	return ctx.db
		.query("reviewCards")
		.withIndex("sourceAnnotationId", (q) =>
			q.eq("sourceAnnotationId", annotationId),
		)
		.first();
}

/** The stored bytes go too, not just the rows. */
export async function deleteRetriesForCard(
	ctx: MutationCtx,
	reviewCardId: Id<"reviewCards">,
): Promise<number> {
	const retries = await ctx.db
		.query("retryRecordings")
		.withIndex("reviewCardId", (q) => q.eq("reviewCardId", reviewCardId))
		.collect();

	for (const retry of retries) {
		// Delete the take's derived score before deleting the take.
		await deleteScoreForRetry(ctx, retry._id);
		await ctx.storage.delete(retry.storageId);
		await ctx.db.delete(retry._id);
	}
	return retries.length;
}

/** A removed note must leave no queue entry behind. */
export async function deleteForAnnotation(
	ctx: MutationCtx,
	annotationId: Id<"annotations">,
): Promise<void> {
	const card = await cardForAnnotation(ctx, annotationId);
	if (card === null) {
		return;
	}
	await deleteRetriesForCard(ctx, card._id);
	await ctx.db.delete(card._id);
}
