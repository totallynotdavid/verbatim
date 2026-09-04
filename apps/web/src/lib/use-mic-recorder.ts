"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone capture in an ordinary browser tab, for the retry-recording flow.
 *
 * This is not the extension's recorder: no tab capture, no offscreen document,
 * no Meet. It is `getUserMedia({ audio: true })` and a `MediaRecorder` on the
 * site's own origin, which is why the permission prompt appears against the
 * website and not against the extension.
 */

/** WebM/Opus first, then whatever the browser will admit to supporting. */
const MIME_CANDIDATES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/ogg;codecs=opus",
	// Safari records MP4/AAC and supports nothing above.
	"audio/mp4",
];

/** A retry is one sentence. Stop on our own rather than record a monologue. */
export const MAX_RETRY_MS = 60_000;

const BITS_PER_SECOND = 48_000;

export type MicRecorderStatus =
	| "unsupported"
	| "idle"
	| "requesting"
	| "recording"
	| "stopping";

export type Recording = {
	blob: Blob;
	mimeType: string;
	/**
	 * Measured while recording. `MediaRecorder` writes WebM with no duration in
	 * its header, the same reason lesson audio carries `audioDurationMs`.
	 */
	durationMs: number;
};

export type MicRecorder = {
	status: MicRecorderStatus;
	error: string | null;
	/** Milliseconds captured so far, for the running timer. */
	elapsedMs: number;
	/** 0-1 input level, so a silent microphone is visible before saving. */
	level: number;
	start: () => void;
	stop: () => void;
	/** Discards a take without saving it. */
	cancel: () => void;
	/** The finished take, until it is cleared. */
	recording: Recording | null;
	clear: () => void;
};

function supportedMimeType(): string | null {
	if (typeof MediaRecorder === "undefined") return null;
	for (const candidate of MIME_CANDIDATES) {
		if (MediaRecorder.isTypeSupported(candidate)) return candidate;
	}
	// An empty type lets the browser pick its own default.
	return "";
}

function permissionMessage(cause: unknown): string {
	const name = cause instanceof DOMException ? cause.name : "";
	if (name === "NotAllowedError" || name === "SecurityError") {
		return "Microphone access was blocked. Allow it for this site in the address bar, then try again.";
	}
	if (name === "NotFoundError" || name === "OverconstrainedError") {
		return "No microphone was found. Plug one in or pick one in your system settings.";
	}
	if (name === "NotReadableError") {
		return "The microphone is busy in another app or tab.";
	}
	return cause instanceof Error ? cause.message : "The microphone could not start.";
}

export function useMicRecorder(): MicRecorder {
	const [status, setStatus] = useState<MicRecorderStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const [level, setLevel] = useState(0);
	const [recording, setRecording] = useState<Recording | null>(null);

	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const contextRef = useRef<AudioContext | null>(null);
	const frameRef = useRef<number | null>(null);
	const startedAtRef = useRef(0);
	const keepRef = useRef(true);

	// Browsers without MediaRecorder cannot offer this flow at all.
	useEffect(() => {
		if (typeof window === "undefined") return;
		if (
			typeof MediaRecorder === "undefined" ||
			navigator.mediaDevices?.getUserMedia === undefined
		) {
			setStatus("unsupported");
		}
	}, []);

	const teardown = useCallback(() => {
		if (frameRef.current !== null) {
			cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
		for (const track of streamRef.current?.getTracks() ?? []) track.stop();
		streamRef.current = null;
		void contextRef.current?.close().catch(() => {});
		contextRef.current = null;
		recorderRef.current = null;
		setLevel(0);
	}, []);

	useEffect(() => teardown, [teardown]);

	const start = useCallback(() => {
		if (status === "recording" || status === "requesting") return;
		setError(null);
		setRecording(null);
		setElapsedMs(0);
		keepRef.current = true;
		setStatus("requesting");

		void (async () => {
			let stream: MediaStream;
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
					},
				});
			} catch (cause) {
				setStatus("idle");
				setError(permissionMessage(cause));
				return;
			}

			streamRef.current = stream;
			const mimeType = supportedMimeType();
			if (mimeType === null) {
				teardown();
				setStatus("unsupported");
				return;
			}

			let recorder: MediaRecorder;
			try {
				recorder = new MediaRecorder(stream, {
					...(mimeType === "" ? {} : { mimeType }),
					audioBitsPerSecond: BITS_PER_SECOND,
				});
			} catch (cause) {
				teardown();
				setStatus("idle");
				setError(
					cause instanceof Error
						? cause.message
						: "This browser could not start a recorder.",
				);
				return;
			}
			recorderRef.current = recorder;

			const chunks: Blob[] = [];
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) chunks.push(event.data);
			};
			recorder.onerror = () => {
				setError("Recording stopped unexpectedly.");
			};
			recorder.onstop = () => {
				const durationMs = Math.max(0, Math.round(performance.now() - startedAtRef.current));
				const type = recorder.mimeType || mimeType || "audio/webm";
				teardown();
				setStatus("idle");
				setElapsedMs(durationMs);
				if (!keepRef.current) return;
				const blob = new Blob(chunks, { type });
				if (blob.size === 0) {
					setError("Nothing was captured. Check that the right microphone is selected.");
					return;
				}
				setRecording({ blob, mimeType: type, durationMs });
			};

			// Level metering is a nicety: a failure here must not stop the take.
			let analyser: AnalyserNode | null = null;
			let samples: Uint8Array<ArrayBuffer> | null = null;
			try {
				const context = new AudioContext();
				contextRef.current = context;
				if (context.state === "suspended") await context.resume();
				analyser = context.createAnalyser();
				analyser.fftSize = 512;
				context.createMediaStreamSource(stream).connect(analyser);
				samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
			} catch {
				analyser = null;
			}

			startedAtRef.current = performance.now();
			recorder.start();
			setStatus("recording");

			const tick = () => {
				const elapsed = performance.now() - startedAtRef.current;
				setElapsedMs(elapsed);

				if (analyser !== null && samples !== null) {
					analyser.getByteTimeDomainData(samples);
					let peak = 0;
					for (const sample of samples) {
						peak = Math.max(peak, Math.abs(sample - 128) / 128);
					}
					setLevel(peak);
				}

				if (elapsed >= MAX_RETRY_MS) {
					if (recorderRef.current?.state === "recording") {
						setStatus("stopping");
						recorderRef.current.stop();
					}
					return;
				}
				frameRef.current = requestAnimationFrame(tick);
			};
			frameRef.current = requestAnimationFrame(tick);
		})();
	}, [status, teardown]);

	const stop = useCallback(() => {
		keepRef.current = true;
		const recorder = recorderRef.current;
		if (recorder === null || recorder.state === "inactive") return;
		setStatus("stopping");
		recorder.stop();
	}, []);

	const cancel = useCallback(() => {
		keepRef.current = false;
		const recorder = recorderRef.current;
		if (recorder !== null && recorder.state !== "inactive") {
			recorder.stop();
			return;
		}
		teardown();
		setStatus("idle");
		setElapsedMs(0);
		setRecording(null);
	}, [teardown]);

	const clear = useCallback(() => {
		setRecording(null);
		setElapsedMs(0);
		setError(null);
	}, []);

	return {
		status,
		error,
		elapsedMs,
		level,
		start,
		stop,
		cancel,
		recording,
		clear,
	};
}
