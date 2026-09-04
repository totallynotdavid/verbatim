import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalQuery,
	mutation,
	type MutationCtx,
} from "./_generated/server";
import { deleteScoreForRetry } from "./model/scoring";
import {
	authorizeStoredFile,
	requireOwnReviewCard,
	type StoredFileTarget,
} from "./model/sessions";

/**
 * A retry is a few seconds of one sentence. Anything longer is a stuck
 * recorder rather than a student saying a flagged phrase again.
 */
const MAX_RETRY_MS = 120_000;

/** Retry audio applies to corrections of pronunciation or filler words. */
const RETRY_TYPES: ReadonlySet<Doc<"annotations">["type"]> = new Set([
	"pronunciation",
	"filler",
]);

/** Loads the note behind a card and refuses types a retry cannot speak to. */
async function requireRetryableCard(
	ctx: MutationCtx,
	card: Doc<"reviewCards">,
): Promise<Doc<"annotations">> {
	const annotation = await ctx.db.get(card.sourceAnnotationId);
	if (annotation === null) {
		throw new Error("That card's note no longer exists");
	}
	if (!RETRY_TYPES.has(annotation.type)) {
		throw new Error(
			`A retry recording only applies to ${[...RETRY_TYPES].join(" and ")} notes, not ${annotation.type}`,
		);
	}
	return annotation;
}

/** Keeps a card's history short enough to compare at a glance. */
const MAX_RETRIES_PER_CARD = 20;

export const generateUploadUrl = mutation({
	args: {
		reviewCardId: v.id("reviewCards"),
	},
	handler: async (ctx, args) => {
		const { card } = await requireOwnReviewCard(ctx, args.reviewCardId);
		// Refuse before an upload happens, not after it has cost bytes.
		await requireRetryableCard(ctx, card);
		return ctx.storage.generateUploadUrl();
	},
});

/** Attaches an uploaded retry; duration is measured during recording. */
export const attach = mutation({
	args: {
		reviewCardId: v.id("reviewCards"),
		storageId: v.id("_storage"),
		durationMs: v.number(),
	},
	handler: async (ctx, args) => {
		const { card, userId } = await requireOwnReviewCard(ctx, args.reviewCardId);

		const existing = await ctx.db
			.query("retryRecordings")
			.withIndex("reviewCardId", (q) => q.eq("reviewCardId", card._id))
			.collect();

		/** Delete unclaimed upload bytes when validation rejects them. */
		const claimed = existing.some((retry) => retry.storageId === args.storageId);
		const reject = async (message: string): Promise<never> => {
			if (!claimed) await ctx.storage.delete(args.storageId);
			throw new Error(message);
		};

		// Re-checked here because an upload URL outlives the call that minted it.
		try {
			await requireRetryableCard(ctx, card);
		} catch (cause) {
			await reject(cause instanceof Error ? cause.message : "Retry not allowed");
		}

		if (!Number.isFinite(args.durationMs) || args.durationMs <= 0) {
			await reject("A retry recording needs a positive duration");
		}
		if (args.durationMs > MAX_RETRY_MS) {
			await reject(
				`A retry recording cannot be longer than ${MAX_RETRY_MS / 1000} seconds`,
			);
		}
		if (existing.length >= MAX_RETRIES_PER_CARD) {
			await reject(
				`This card already has ${MAX_RETRIES_PER_CARD} retries. Delete one before recording another.`,
			);
		}

		const retryRecordingId = await ctx.db.insert("retryRecordings", {
			reviewCardId: card._id,
			annotationId: card.sourceAnnotationId,
			storageId: args.storageId,
			recordedBy: userId,
			durationMs: Math.round(args.durationMs),
			createdAt: Date.now(),
		});

		// Score each saved take when the worker is configured.
		await ctx.scheduler.runAfter(0, internal.retryScoring.score, {
			retryRecordingId,
		});
		return retryRecordingId;
	},
});

export const remove = mutation({
	args: {
		retryRecordingId: v.id("retryRecordings"),
	},
	handler: async (ctx, args) => {
		const retry = await ctx.db.get(args.retryRecordingId);
		if (retry === null) {
			throw new Error("Retry recording not found");
		}
		// Membership lets both people hear it; only the speaker can delete it.
		const { userId } = await requireOwnReviewCard(ctx, retry.reviewCardId);
		if (retry.recordedBy !== userId) {
			throw new Error("That retry was recorded by someone else");
		}

		await deleteScoreForRetry(ctx, retry._id);
		await ctx.storage.delete(retry.storageId);
		await ctx.db.delete(retry._id);
	},
});

/**
 * Authorizes a retry-audio request through the lesson that produced the card,
 * so a personal pronunciation clip is protected exactly like lesson audio.
 * String input lets malformed URL ids return 404.
 */
export const audioRequestTarget = internalQuery({
	args: {
		retryId: v.string(),
	},
	handler: async (ctx, args): Promise<StoredFileTarget> =>
		authorizeStoredFile(ctx, async () => {
			const retryId: Id<"retryRecordings"> | null = ctx.db.normalizeId(
				"retryRecordings",
				args.retryId,
			);
			if (retryId === null) return null;
			const retry = await ctx.db.get(retryId);
			if (retry === null) return null;
			const card = await ctx.db.get(retry.reviewCardId);
			if (card === null) return null;
			const session = await ctx.db.get(card.sessionId);
			if (session === null) return null;
			return { session, storageId: retry.storageId };
		}),
});
