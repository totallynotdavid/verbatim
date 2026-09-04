"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Clip, clipWindow } from "./clip";

export type ClipTarget = {
	/** Identifier for the selected clip. */
	key: string;
	startMs: number;
	endMs: number;
};

export type ClipPlayerStatus =
	| "absent"
	| "downloading"
	| "decoding"
	| "ready"
	| "error";

export type ClipPlayer = {
	audioRef: React.RefObject<HTMLAudioElement | null>;
	status: ClipPlayerStatus;
	error: string | null;
	/** Download progress, or null when the size is unknown. */
	progress: number | null;
	playing: boolean;
	/** Selected clip key, or the last one played. */
	activeKey: string | null;
	/** Current playhead in session-clock milliseconds. */
	positionMs: number | null;
	clipFor: (target: Pick<ClipTarget, "startMs" | "endMs">) => Clip;
	play: (target: ClipTarget) => void;
	stop: () => void;
	/** Handlers for the audio element driven by this hook. */
	handlers: {
		onTimeUpdate: () => void;
		onLoadedMetadata: () => void;
		onEnded: () => void;
		onPause: () => void;
		onError: () => void;
	};
};

const DURATION_PROBE_TIMEOUT_MS = 3000;
/** Finite seek value used to force duration probing. */
const DURATION_PROBE_SECONDS = 1e7;

/**
 * Plays a padded transcript clip from one lesson recording.
 *
 * The file is downloaded once with the caller's auth token and reused through
 * a blob URL. `timeupdate` and `requestAnimationFrame` both enforce the clip
 * end because either mechanism can be delayed or suspended on its own.
 */
export function useClipPlayer({
	url,
	authToken,
	offsetMs,
	durationMs,
}: {
	url: string | null;
	/** Token required by the audio route. */
	authToken: string | null;
	offsetMs: number;
	durationMs: number | null;
}): ClipPlayer {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	// Keep token changes from restarting the download.
	const authTokenRef = useRef(authToken);
	authTokenRef.current = authToken;
	const hasAuthToken = authToken !== null;
	const stopAtRef = useRef<number | null>(null);
	const frameRef = useRef<number | null>(null);
	const probedRef = useRef(false);

	const [status, setStatus] = useState<ClipPlayerStatus>(
		url === null ? "absent" : "downloading",
	);

	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const [playing, setPlaying] = useState(false);
	const [activeKey, setActiveKey] = useState<string | null>(null);
	const [positionMs, setPositionMs] = useState<number | null>(null);

	const cancelFrames = useCallback(() => {
		if (frameRef.current !== null) {
			cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
	}, []);

	const stop = useCallback(() => {
		stopAtRef.current = null;
		cancelFrames();
		audioRef.current?.pause();
		setPlaying(false);
	}, [cancelFrames]);

	/** Shared by media and animation-frame stop checks. */
	const enforceClipEnd = useCallback(() => {
		const element = audioRef.current;
		if (!element) return;
		const stopAt = stopAtRef.current;
		if (stopAt !== null && element.currentTime >= stopAt) {
			stopAtRef.current = null;
			cancelFrames();
			element.pause();
			setPlaying(false);
		}
	}, [cancelFrames]);

	useEffect(() => {
		if (url === null) {
			setStatus("absent");
			return;
		}
		// Avoid an unauthenticated request while auth is resolving.
		if (!hasAuthToken) {
			setStatus("downloading");
			return;
		}

		const element = audioRef.current;
		if (!element) {
			setStatus("error");
			setError("The audio element is not mounted");
			return;
		}

		const controller = new AbortController();
		let objectUrl: string | null = null;
		let cancelled = false;

		probedRef.current = false;
		setStatus("downloading");
		setProgress(null);
		setError(null);

		void (async () => {
			try {
				const response = await fetch(url, {
					signal: controller.signal,
					headers: { Authorization: `Bearer ${authTokenRef.current}` },
				});
				if (response.status === 401) {
					throw new Error("Your sign-in expired. Reload the page to listen.");
				}
				if (response.status === 403) {
					throw new Error("This lesson recording is not yours to play.");
				}
				if (!response.ok) {
					throw new Error(`The recording could not be loaded (${response.status})`);
				}

				const declared = response.headers.get("content-length");
				const total = declared === null ? null : Number(declared);
				let blob: Blob;

				if (response.body === null || total === null || !Number.isFinite(total)) {
					blob = await response.blob();
				} else {
					const reader = response.body.getReader();
					const chunks: Uint8Array[] = [];
					let received = 0;
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						chunks.push(value);
						received += value.byteLength;
						setProgress(Math.min(1, received / total));
					}
					blob = new Blob(chunks as BlobPart[], {
						type: response.headers.get("content-type") ?? "",
					});
				}

				if (cancelled) return;
				objectUrl = URL.createObjectURL(blob);
				setStatus("decoding");
				element.src = objectUrl;
				element.load();
			} catch (cause) {
				if (cancelled || controller.signal.aborted) return;
				setStatus("error");
				setError(
					cause instanceof Error ? cause.message : "The recording could not be loaded",
				);
			}
		})();

		return () => {
			cancelled = true;
			controller.abort();
			cancelFrames();
			stopAtRef.current = null;
			element.pause();
			element.removeAttribute("src");
			element.load();
			if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
		};
	}, [url, hasAuthToken, cancelFrames]);

	useEffect(() => cancelFrames, [cancelFrames]);

	const clipFor = useCallback(
		(target: Pick<ClipTarget, "startMs" | "endMs">) =>
			clipWindow({
				startMs: target.startMs,
				endMs: target.endMs,
				offsetMs,
				durationMs,
			}),
		[offsetMs, durationMs],
	);

	const play = useCallback(
		(target: ClipTarget) => {
			const element = audioRef.current;
			if (!element || status !== "ready") return;

			const clip = clipFor(target);
			setActiveKey(target.key);
			if (!clip.available) {
				stop();
				return;
			}

			cancelFrames();
			stopAtRef.current = clip.end;
			element.currentTime = clip.start;
			setPositionMs(clip.start * 1000 + offsetMs);

			void element
				.play()
				.then(() => {
					setPlaying(true);
					const tick = () => {
						enforceClipEnd();
						if (audioRef.current && !audioRef.current.paused) {
							frameRef.current = requestAnimationFrame(tick);
						} else {
							frameRef.current = null;
						}
					};
					frameRef.current = requestAnimationFrame(tick);
				})
				.catch((cause: unknown) => {
					stopAtRef.current = null;
					setPlaying(false);
					setError(
						cause instanceof Error ? cause.message : "Playback was blocked",
					);
				});
		},
		[status, clipFor, offsetMs, stop, cancelFrames, enforceClipEnd],
	);

	const handlers = {
		onTimeUpdate: useCallback(() => {
			const element = audioRef.current;
			if (element) setPositionMs(element.currentTime * 1000 + offsetMs);
			enforceClipEnd();
		}, [enforceClipEnd, offsetMs]),

		// MediaRecorder WebM may report Infinity until a seek forces duration parsing.
			onLoadedMetadata: useCallback(() => {
			const element = audioRef.current;
			if (!element) return;
			if (Number.isFinite(element.duration) || probedRef.current) {
				setStatus("ready");
				return;
			}

			probedRef.current = true;
			const finish = () => {
				window.clearTimeout(timer);
				element.removeEventListener("durationchange", onResolved);
				element.removeEventListener("seeked", onResolved);
				element.currentTime = 0;
				setStatus("ready");
			};
			const onResolved = () => {
				if (Number.isFinite(element.duration) || element.currentTime > 0) finish();
			};
			const timer = window.setTimeout(finish, DURATION_PROBE_TIMEOUT_MS);
			element.addEventListener("durationchange", onResolved);
			element.addEventListener("seeked", onResolved);
			try {
				element.currentTime = DURATION_PROBE_SECONDS;
			} catch {
				finish();
			}
		}, []),

		onEnded: useCallback(() => {
			stopAtRef.current = null;
			cancelFrames();
			setPlaying(false);
		}, [cancelFrames]),

		onPause: useCallback(() => {
			cancelFrames();
			setPlaying(false);
		}, [cancelFrames]),

		onError: useCallback(() => {
			// Clearing `src` can emit error. Only handle errors with a source attached.
			if (!audioRef.current?.currentSrc) return;
			setStatus("error");
			setError("This browser could not play the lesson recording");
		}, []),
	};

	return {
		audioRef,
		status,
		error,
		progress,
		playing,
		activeKey,
		positionMs,
		clipFor,
		play,
		stop,
		handlers,
	};
}
