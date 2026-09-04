import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { LESSON_AUDIO_PATH } from "./model/sessions";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Keep recordings out of shared caches and vary auth-specific responses. */
const AUDIO_CACHE_CONTROL = "private, max-age=3600";

/**
 * Use the configured site origin for browser requests. Authorization still
 * controls access when the fallback wildcard is used.
 */
function allowedOrigin(): string {
	return process.env.SITE_URL ?? "*";
}

function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": allowedOrigin(),
		Vary: "Origin, Authorization",
	};
}

/**
 * Streams a recording after reauthorizing the caller for its lesson.
 *
 * An authenticated route avoids exposing a permanent storage URL. Convex
 * limits HTTP action responses to 20MB.
 */
http.route({
	path: LESSON_AUDIO_PATH,
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const sessionId = new URL(request.url).searchParams.get("sessionId");
		if (sessionId === null || sessionId === "") {
			return new Response("Missing sessionId", {
				status: 400,
				headers: corsHeaders(),
			});
		}

		const target = await ctx.runQuery(
			internal.lessonSessions.audioRequestTarget,
			{ sessionId },
		);

		if (!target.ok) {
			const status =
				target.reason === "unauthenticated"
					? 401
					: target.reason === "forbidden"
						? 403
						: 404;
			return new Response(target.reason, {
				status,
				headers: {
					...corsHeaders(),
						// Tell unauthenticated callers how to authenticate.
					...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
				},
			});
		}

		const blob = await ctx.storage.get(target.storageId);
		if (blob === null) {
			return new Response("not-found", { status: 404, headers: corsHeaders() });
		}

		return new Response(blob, {
			headers: {
				...corsHeaders(),
				"Content-Type": target.contentType ?? "application/octet-stream",
				"Cache-Control": AUDIO_CACHE_CONTROL,
			},
		});
	}),
});

/** Responds to browser preflight requests for authenticated audio. */
http.route({
	path: LESSON_AUDIO_PATH,
	method: "OPTIONS",
	handler: httpAction(async (_ctx, request) => {
		const headers = request.headers;
		if (
			headers.get("Origin") === null ||
			headers.get("Access-Control-Request-Method") === null
		) {
			return new Response(null, { status: 204 });
		}
		return new Response(null, {
			status: 204,
			headers: {
				...corsHeaders(),
				"Access-Control-Allow-Methods": "GET, OPTIONS",
				"Access-Control-Allow-Headers": "Authorization",
				"Access-Control-Max-Age": "86400",
			},
		});
	}),
});

export default http;
