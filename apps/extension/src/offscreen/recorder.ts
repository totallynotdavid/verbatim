import {
	AUDIO_BITS_PER_SECOND,
	AUDIO_MIME_TYPE,
	AUDIO_TIMESLICE_MS,
} from "../shared/config";
import type {
	AudioStartResult,
	AudioStopResult,
	AudioUploadResult,
	MicPermission,
} from "../shared/protocol";

/**
 * Captures tab and microphone audio in an offscreen document.
 *
 * Tab capture mutes Meet's normal output, so the tab source is also routed to
 * speakers. An offscreen document cannot prompt for microphone access. Without
 * prior permission, recording falls back to tab audio.
 */

type Session = {
	recorder: MediaRecorder;
	context: AudioContext;
	/** Tracks to stop when the session ends. */
	tracks: MediaStreamTrack[];
	chunks: Blob[];
	/** AudioContext time when the recorder started, in seconds. */
	audioClockStart: number;
	startedAtMs: number;
	stopped: Promise<AudioStopResult>;
};

let session: Session | null = null;
/** Survives the recorder so a failed upload can be retried without re-recording. */
let recording: { blob: Blob; result: AudioStopResult } | null = null;

export async function queryMicPermission(): Promise<MicPermission> {
	try {
		const status = await navigator.permissions.query({
			name: "microphone" as PermissionName,
		});
		return status.state as MicPermission;
	} catch {
		// Some Chrome versions reject the microphone descriptor.
		return "unknown";
	}
}

/** Opens the tab's audio stream from Chrome's stream ID. */
async function openTabStream(streamId: string): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia({
		audio: {
			mandatory: {
				chromeMediaSource: "tab",
				chromeMediaSourceId: streamId,
			},
		},
		video: false,
	} as unknown as MediaStreamConstraints);
}

/** Returns the local microphone, or null when it is unavailable. */
async function openMicStream(): Promise<MediaStream | null> {
	try {
		return await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});
	} catch {
		return null;
	}
}

export async function startRecording(
	streamId: string,
): Promise<AudioStartResult> {
	if (session !== null) {
		throw new Error("Already recording");
	}
	recording = null;

	const tabStream = await openTabStream(streamId);
	const context = new AudioContext();
	// Resume explicitly so a suspended context cannot record silence.
	if (context.state === "suspended") {
		await context.resume();
	}

	const destination = context.createMediaStreamDestination();
	const tabSource = context.createMediaStreamSource(tabStream);
	tabSource.connect(destination);
	// Tab capture mutes the tab, so route its audio back to speakers.
	tabSource.connect(context.destination);

	const mic = await openMicStream();
	if (mic !== null) {
		// Keep microphone audio out of speakers to avoid feedback.
		context.createMediaStreamSource(mic).connect(destination);
	}

	const tracks = [
		...tabStream.getTracks(),
		...(mic?.getTracks() ?? []),
	];

	const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
		? AUDIO_MIME_TYPE
		: "audio/webm";
	const recorder = new MediaRecorder(destination.stream, {
		mimeType,
		audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
	});

	const chunks: Blob[] = [];
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};

	const started = new Promise<{ startedAtMs: number; audioClock: number }>(
		(resolve, reject) => {
			recorder.onstart = () =>
				resolve({ startedAtMs: Date.now(), audioClock: context.currentTime });
			recorder.onerror = (event) =>
				reject(new Error(recorderErrorMessage(event)));
		},
	);

	const stopped = new Promise<AudioStopResult>((resolve, reject) => {
		recorder.onstop = () => {
			const current = session;
			if (current === null) {
				reject(new Error("Recorder stopped without a session"));
				return;
			}
			const blob = new Blob(chunks, { type: mimeType });
			const result: AudioStopResult = {
				durationMs: Math.max(
					0,
					Math.round((context.currentTime - current.audioClockStart) * 1000),
				),
				wallClockMs: Math.max(0, Date.now() - current.startedAtMs),
				sizeBytes: blob.size,
				mimeType,
			};
			recording = { blob, result };
			for (const track of current.tracks) track.stop();
			void context.close();
			session = null;
			resolve(result);
		};
	});

	recorder.start(AUDIO_TIMESLICE_MS);
	const { startedAtMs, audioClock } = await started;

	session = {
		recorder,
		context,
		tracks,
		chunks,
		audioClockStart: audioClock,
		startedAtMs,
		stopped,
	};

	// Preserve audio when the captured tab closes.
	for (const track of tabStream.getAudioTracks()) {
		track.addEventListener("ended", () => {
			if (session !== null && session.recorder.state !== "inactive") {
				session.recorder.stop();
			}
		});
	}

	return {
		startedAtMs,
		micIncluded: mic !== null,
		mic: await queryMicPermission(),
	};
}

export async function stopRecording(): Promise<AudioStopResult> {
	const current = session;
	if (current === null) {
		// The blob may remain after the capture track ends.
		if (recording !== null) return recording.result;
		throw new Error("Not recording");
	}
	if (current.recorder.state !== "inactive") {
		current.recorder.stop();
	}
	return current.stopped;
}

export async function uploadRecording(
	uploadUrl: string,
): Promise<AudioUploadResult> {
	const held = recording;
	if (held === null) {
		throw new Error("No recording to upload");
	}
	const response = await fetch(uploadUrl, {
		method: "POST",
		headers: { "Content-Type": held.result.mimeType },
		body: held.blob,
	});
	if (!response.ok) {
		throw new Error(
			`Upload rejected with ${response.status} ${response.statusText}`,
		);
	}
	const body = (await response.json()) as { storageId?: string };
	if (typeof body.storageId !== "string") {
		throw new Error("Upload response had no storage ID");
	}
	return { storageId: body.storageId };
}

/** Drops the buffered blob after upload succeeds. */
export function discardRecording(): void {
	recording = null;
}

function recorderErrorMessage(event: Event): string {
	const error = (event as Event & { error?: DOMException }).error;
	return error === undefined
		? "MediaRecorder failed"
		: `${error.name}: ${error.message}`;
}
