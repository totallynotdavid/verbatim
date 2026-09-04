import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { type ActionCtx, httpAction } from "./_generated/server";
import {
	LESSON_AUDIO_PATH,
	RETRY_AUDIO_PATH,
	type StoredFileTarget,
} from "./model/sessions";

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
 * Registers an authenticated audio route.
 *
 * Lesson recordings and retry recordings are both private audio behind the same
 * lesson membership check, so they get the same route: no storage URL, the
 * caller reauthorized on every request, and the bytes streamed from an HTTP
 * action. They differ only in which id the URL carries and which internal query
 * resolves it. Convex limits HTTP action responses to 20MB.
 */
function routeStoredAudio({
	path,
	param,
	fetchTarget,
}: {
	path: string;
	/** Query-string parameter carrying the id. */
	param: string;
	fetchTarget: (ctx: ActionCtx, id: string) => Promise<StoredFileTarget>;
}) {
	http.route({
		path,
		method: "GET",
		handler: httpAction(async (ctx, request) => {
			const id = new URL(request.url).searchParams.get(param);
			if (id === null || id === "") {
				return new Response(`Missing ${param}`, {
					status: 400,
					headers: corsHeaders(),
				});
			}

			const target = await fetchTarget(ctx, id);

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
				return new Response("not-found", {
					status: 404,
					headers: corsHeaders(),
				});
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
		path,
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
}

routeStoredAudio({
	path: LESSON_AUDIO_PATH,
	param: "sessionId",
	fetchTarget: (ctx, sessionId) =>
		ctx.runQuery(internal.lessonSessions.audioRequestTarget, { sessionId }),
});

routeStoredAudio({
	path: RETRY_AUDIO_PATH,
	param: "retryId",
	fetchTarget: (ctx, retryId) =>
		ctx.runQuery(internal.retryRecordings.audioRequestTarget, { retryId }),
});

export default http;
