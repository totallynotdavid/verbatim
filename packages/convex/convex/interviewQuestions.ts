import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireTutor } from "./model/sessions";
import { interviewDifficulty, interviewTopic } from "./schema";

const MAX_PROMPT_LENGTH = 2000;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 32;

function normalizePrompt(prompt: string): string {
	const trimmed = prompt.trim();
	if (trimmed === "") {
		throw new Error("A question needs prompt text");
	}
	if (trimmed.length > MAX_PROMPT_LENGTH) {
		throw new Error(
			`A question cannot be longer than ${MAX_PROMPT_LENGTH} characters`,
		);
	}
	return trimmed;
}

/** Normalizes tags for case-insensitive deduplication. */
function normalizeTags(tags: readonly string[]): string[] {
	const seen: string[] = [];
	for (const tag of tags) {
		const normalized = tag.trim().toLowerCase();
		if (normalized === "") continue;
		if (normalized.length > MAX_TAG_LENGTH) {
			throw new Error(
				`A tag cannot be longer than ${MAX_TAG_LENGTH} characters`,
			);
		}
		if (!seen.includes(normalized)) seen.push(normalized);
	}
	if (seen.length > MAX_TAGS) {
		throw new Error(`A question cannot have more than ${MAX_TAGS} tags`);
	}
	return seen;
}

async function usageCount(
	ctx: QueryCtx,
	questionId: Doc<"interviewQuestions">["_id"],
): Promise<number> {
	const segments = await ctx.db
		.query("interviewSegments")
		.withIndex("questionId", (q) => q.eq("questionId", questionId))
		.collect();
	return segments.length;
}

/** Lists the question bank newest first with segment usage counts. */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			return [];
		}

		const questions = await ctx.db.query("interviewQuestions").collect();
		questions.sort((a, b) => b.createdAt - a.createdAt);

		return Promise.all(
			questions.map(async (question) => ({
				_id: question._id,
				topic: question.topic,
				difficulty: question.difficulty,
				prompt: question.prompt,
				tags: question.tags,
				createdAt: question.createdAt,
				updatedAt: question.updatedAt,
				usageCount: await usageCount(ctx, question._id),
			})),
		);
	},
});

export const create = mutation({
	args: {
		topic: interviewTopic,
		difficulty: interviewDifficulty,
		prompt: v.string(),
		tags: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const tutor = await requireTutor(ctx);
		const now = Date.now();

		return ctx.db.insert("interviewQuestions", {
			topic: args.topic,
			difficulty: args.difficulty,
			prompt: normalizePrompt(args.prompt),
			tags: normalizeTags(args.tags ?? []),
			createdBy: tutor._id,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const update = mutation({
	args: {
		questionId: v.id("interviewQuestions"),
		topic: v.optional(interviewTopic),
		difficulty: v.optional(interviewDifficulty),
		prompt: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		await requireTutor(ctx);

		const question = await ctx.db.get(args.questionId);
		if (question === null) {
			throw new Error("Interview question not found");
		}

		const patch: Partial<Doc<"interviewQuestions">> = {};
		if (args.topic !== undefined) patch.topic = args.topic;
		if (args.difficulty !== undefined) patch.difficulty = args.difficulty;
		if (args.prompt !== undefined) patch.prompt = normalizePrompt(args.prompt);
		if (args.tags !== undefined) patch.tags = normalizeTags(args.tags);
		if (Object.keys(patch).length === 0) {
			return question._id;
		}

		patch.updatedAt = Date.now();
		await ctx.db.patch(question._id, patch);
		return question._id;
	},
});

/** Deletes an unused question so tagged segments retain their reference. */
export const remove = mutation({
	args: {
		questionId: v.id("interviewQuestions"),
	},
	handler: async (ctx, args) => {
		await requireTutor(ctx);

		const question = await ctx.db.get(args.questionId);
		if (question === null) {
			throw new Error("Interview question not found");
		}

		const used = await usageCount(ctx, question._id);
		if (used > 0) {
			throw new Error(
				`This question is tagged on ${used} lesson ${
					used === 1 ? "segment" : "segments"
				}; untag those before deleting it`,
			);
		}

		await ctx.db.delete(question._id);
	},
});
