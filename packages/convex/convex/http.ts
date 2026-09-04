import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { type ActionCtx, httpAction } from "./_generated/server";
import {
	runToken,
	SCORING_AUDIO_PATH,
	SCORING_CALLBACK_PATH,
	timingSafeEqual,
} from "./model/scoring";
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

/** Registers a private audio route with per-request authorization. */
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

/* Worker routes use per-run URL tokens because Replicate cannot send Convex Auth
 * headers. They must not use member-session authorization. */

type RunAuth =
	| { ok: true; runId: string }
	| { ok: false; response: Response };

/**
 * Authorizes a worker request before reading its body or loading a run.
 *
 * Missing configuration returns 503; invalid credentials return 401.
 */
async function authorizeRun(
	request: Request,
	purpose: "audio" | "callback",
): Promise<RunAuth> {
	const secret = process.env.SCORING_CALLBACK_SECRET;
	if (secret === undefined || secret === "") {
		return {
			ok: false,
			response: new Response("scoring-not-configured", { status: 503 }),
		};
	}

	const params = new URL(request.url).searchParams;
	const runId = params.get("run") ?? "";
	const token = params.get("token") ?? "";
	if (runId === "" || token === "") {
		return { ok: false, response: new Response("unauthorized", { status: 401 }) };
	}

	const expected = await runToken(purpose, runId, secret);
	if (!timingSafeEqual(token, expected)) {
		return { ok: false, response: new Response("unauthorized", { status: 401 }) };
	}
	return { ok: true, runId };
}

/** Serves lesson audio through a revocable, run-scoped URL. */
http.route({
	path: SCORING_AUDIO_PATH,
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const auth = await authorizeRun(request, "audio");
		if (!auth.ok) return auth.response;

		const target = await ctx.runQuery(internal.scoring.runAudioTarget, {
			runId: auth.runId,
		});
		if (target === null) {
			return new Response("not-found", { status: 404 });
		}
		const blob = await ctx.storage.get(target.storageId);
		if (blob === null) {
			return new Response("not-found", { status: 404 });
		}

		return new Response(blob, {
			headers: {
				"Content-Type": target.contentType ?? "application/octet-stream",
				// Lesson audio must not be cached.
				"Cache-Control": "private, no-store",
			},
		});
	}),
});

/** Accepts the final transcription; repeated deliveries are acknowledged. */
http.route({
	path: SCORING_CALLBACK_PATH,
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const auth = await authorizeRun(request, "callback");
		if (!auth.ok) return auth.response;

		const run = await ctx.runQuery(internal.scoring.runForWorker, {
			runId: auth.runId,
		});
		if (run === null) {
			return new Response("not-found", { status: 404 });
		}

		let prediction: { status?: unknown; output?: unknown; error?: unknown };
		try {
			prediction = (await request.json()) as typeof prediction;
		} catch {
			return new Response("bad-request", { status: 400 });
		}

		const failed = (error: string) =>
			ctx.runMutation(internal.scoring.patchRun, {
				runId: run._id,
				status: "failed" as const,
				error,
			});

		if (prediction.status !== "succeeded") {
			const detail =
				typeof prediction.error === "string" && prediction.error !== ""
					? prediction.error
					: "no error was reported";
			await failed(
				`The transcription ended as "${String(prediction.status ?? "unknown")}": ${detail}`,
			);
			return new Response("ok", { status: 200 });
		}

		const output = prediction.output;
		if (output === null || typeof output !== "object") {
			await failed("The transcription finished but returned nothing");
			return new Response("ok", { status: 200 });
		}

		// Large word-level output can exceed the document limit, so store it as a file.
		const storageId = await ctx.storage.store(
			new Blob([JSON.stringify(output)], { type: "application/json" }),
		);
		await ctx.runMutation(internal.scoring.acceptResult, {
			runId: run._id,
			storageId,
		});
		return new Response("ok", { status: 200 });
	}),
});

export default http;
