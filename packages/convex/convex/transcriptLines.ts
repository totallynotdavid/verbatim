import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireOwnSession } from "./model/sessions";

/** Resolves an exact participant-name match. */
async function resolveSpeakerId(
	ctx: MutationCtx,
	session: Doc<"lessonSessions">,
	speakerLabel: string | undefined,
): Promise<Id<"users"> | undefined> {
	if (speakerLabel === undefined) {
		return undefined;
	}
	const normalized = speakerLabel.trim().toLowerCase();
	if (normalized === "") {
		return undefined;
	}

	const [tutor, student] = await Promise.all([
		ctx.db.get(session.tutorId),
		ctx.db.get(session.studentId),
	]);
	for (const candidate of [tutor, student]) {
		if (candidate?.name && candidate.name.trim().toLowerCase() === normalized) {
			return candidate._id;
		}
	}
	return undefined;
}

/** Stores finalized caption lines. Order makes retries idempotent. */
export const append = mutation({
	args: {
		sessionId: v.id("lessonSessions"),
		lines: v.array(
			v.object({
				speakerLabel: v.optional(v.string()),
				text: v.string(),
				startMs: v.number(),
				endMs: v.number(),
				order: v.number(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const { session } = await requireOwnSession(ctx, args.sessionId);
		if (session.status !== "recording") {
			throw new Error(
				`Lesson session is no longer recording (status: ${session.status})`,
			);
		}

		let inserted = 0;
		let skipped = 0;
		for (const line of args.lines) {
			const existing = await ctx.db
				.query("transcriptLines")
				.withIndex("sessionId_order", (q) =>
					q.eq("sessionId", args.sessionId).eq("order", line.order),
				)
				.first();
			if (existing !== null) {
				skipped++;
				continue;
			}

			await ctx.db.insert("transcriptLines", {
				sessionId: args.sessionId,
				speakerId: await resolveSpeakerId(ctx, session, line.speakerLabel),
				speakerLabel: line.speakerLabel,
				text: line.text,
				startMs: line.startMs,
				endMs: line.endMs,
				order: line.order,
			});
			inserted++;
		}

		return { inserted, skipped };
	},
});
