import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";

async function requireCurrentUser(ctx: QueryCtx): Promise<Doc<"users">> {
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

function generateInviteCode(): string {
	// Avoid visually ambiguous characters in codes.
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
}

/** Returns the signed-in user's profile, partner info, and open invite. */
export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			return null;
		}
		const user = await ctx.db.get(userId);
		if (user === null) {
			return null;
		}

		const partner = user.pairedWithUserId
			? await ctx.db.get(user.pairedWithUserId)
			: null;

		return {
			_id: user._id,
			name: user.name ?? null,
			email: user.email ?? null,
			image: user.image ?? null,
			role: user.role ?? null,
			standingConsent: user.standingConsent ?? false,
			pairingInviteCode: user.pairingInviteCode ?? null,
			partner: partner
				? {
						_id: partner._id,
						name: partner.name ?? null,
						role: partner.role ?? null,
					}
				: null,
		};
	},
});

/** Sets the user's role during onboarding. The role cannot be changed later. */
export const setRole = mutation({
	args: {
		role: v.union(v.literal("tutor"), v.literal("student")),
	},
	handler: async (ctx, args) => {
		const user = await requireCurrentUser(ctx);
		if (user.role !== undefined) {
			throw new Error("Role is already set and cannot be changed");
		}
		await ctx.db.patch(user._id, { role: args.role });
	},
});

/** Returns the code that the user's tutor/student counterpart can redeem. */
export const createPairingInvite = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await requireCurrentUser(ctx);
		if (user.role === undefined) {
			throw new Error("Set a role before generating an invite code");
		}
		if (user.pairedWithUserId !== undefined) {
			throw new Error("Already paired");
		}
		if (user.pairingInviteCode) {
			return user.pairingInviteCode;
		}

		// Retry if the generated code is already in use.
		for (let attempt = 0; attempt < 5; attempt++) {
			const code = generateInviteCode();
			const existing = await ctx.db
				.query("users")
				.withIndex("pairingInviteCode", (q) => q.eq("pairingInviteCode", code))
				.first();
			if (existing === null) {
				await ctx.db.patch(user._id, { pairingInviteCode: code });
				return code;
			}
		}
		throw new Error("Could not generate a unique invite code, try again");
	},
});

/**
 * Completes the only pairing allowed for this product. Users must be unpaired
 * and have opposite roles.
 */
export const acceptPairingInvite = mutation({
	args: {
		code: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireCurrentUser(ctx);
		if (user.role === undefined) {
			throw new Error("Set a role before entering an invite code");
		}
		if (user.pairedWithUserId !== undefined) {
			throw new Error("Already paired");
		}

		const code = args.code.trim().toUpperCase();
		const inviter = await ctx.db
			.query("users")
			.withIndex("pairingInviteCode", (q) => q.eq("pairingInviteCode", code))
			.first();

		if (inviter === null) {
			throw new Error("Invalid or expired invite code");
		}
		if (inviter._id === user._id) {
			throw new Error("You cannot redeem your own invite code");
		}
		if (inviter.pairedWithUserId !== undefined) {
			throw new Error("That invite has already been used");
		}
		if (inviter.role === undefined || inviter.role === user.role) {
			throw new Error(
				"A pairing must have one tutor and one student",
			);
		}

		await ctx.db.patch(inviter._id, {
			pairedWithUserId: user._id,
			pairingInviteCode: undefined,
		});
		await ctx.db.patch(user._id, { pairedWithUserId: inviter._id });
	},
});

/**
 * Sets consent for future recordings without changing existing session
 * snapshots.
 */
export const setStandingConsent = mutation({
	args: {
		consent: v.boolean(),
	},
	handler: async (ctx, args) => {
		const user = await requireCurrentUser(ctx);
		await ctx.db.patch(user._id, { standingConsent: args.consent });
	},
});
