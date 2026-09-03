import { browser } from "wxt/browser";
import { DEFAULT_CONVEX_URL } from "../shared/config";
import type { AuthStatus } from "../shared/protocol";

/** Stores the access token. Renewal requires a new handoff from the website. */

const STORAGE_KEY = "verbatim.auth";

export type StoredAuth = {
	token: string;
	convexUrl: string;
	account: string | null;
	/** Epoch ms, read from the token's own `exp` claim. */
	expiresAt: number;
};

/**
 * Treat a token as unusable slightly before its stated expiry, so a request in
 * flight does not land on the far side of the boundary.
 */
const EXPIRY_SKEW_MS = 30_000;

/** Reads the `exp` claim without verifying the signature. Convex verifies it. */
export function readExpiry(token: string): number {
	const payload = token.split(".")[1];
	if (payload === undefined) return 0;
	try {
		const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
		const claims = JSON.parse(json) as { exp?: number };
		return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
	} catch {
		return 0;
	}
}

export async function loadAuth(): Promise<StoredAuth | null> {
	const stored = await browser.storage.local.get(STORAGE_KEY);
	return (stored[STORAGE_KEY] as StoredAuth | undefined) ?? null;
}

export async function saveAuth(auth: {
	token: string;
	convexUrl?: string;
	account?: string | null;
}): Promise<StoredAuth> {
	const record: StoredAuth = {
		token: auth.token,
		convexUrl: auth.convexUrl || DEFAULT_CONVEX_URL,
		account: auth.account ?? null,
		expiresAt: readExpiry(auth.token),
	};
	await browser.storage.local.set({ [STORAGE_KEY]: record });
	return record;
}

/** Marks the token unusable while retaining the account name for the overlay. */
export async function expireAuth(): Promise<void> {
	const current = await loadAuth();
	if (current === null) return;
	await browser.storage.local.set({
		[STORAGE_KEY]: { ...current, expiresAt: 0 },
	});
}

export function authStatus(auth: StoredAuth | null, nowMs: number): AuthStatus {
	if (auth === null || auth.token === "") return "missing";
	return auth.expiresAt - EXPIRY_SKEW_MS > nowMs ? "connected" : "expired";
}

/** Identifies errors that mean the stored token can no longer authenticate. */
export function isAuthFailure(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /not signed in|unauthenticated|unauthorized|authentication|invalid token|token.*expired|expired.*token/i.test(
		message,
	);
}
