"use client";

import { api } from "@verbatim/backend/convex/_generated/api";
import * as Button from "@verbatim/ui/button";
import { cn } from "@verbatim/ui/cn";
import { useMutation } from "convex/react";
import { Mic, Play, Square, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/review-grades";
import type { ClipPlayer } from "@/lib/use-clip-player";
import { MAX_RETRY_MS, useMicRecorder } from "@/lib/use-mic-recorder";
import type { ReviewCard, RetryRecording } from "./types";

/**
 * Records the student saying the flagged words again and plays the take back
 * next to the original.
 *
 * Comparison is the whole feature: there is no scoring here, and there is not
 * meant to be until Phase 5. Each take is stored as its own short recording
 * rather than edited into the lesson audio, so the lesson stays the record of
 * what was actually said.
 */
export function RetryPanel({
	card,
	viewerId,
	canRecord,
	player,
	selectedRetryId,
	onSelectRetry,
	onBeforeRecord,
}: {
	card: ReviewCard;
	viewerId: string;
	/**
	 * Whether this note's type is one a retry says anything about. False only
	 * for a card that already holds takes and was re-typed afterwards, which
	 * keeps them playable without offering to add more.
	 */
	canRecord: boolean;
	/** Player bound to the selected saved retry. */
	player: ClipPlayer;
	selectedRetryId: string | null;
	onSelectRetry: (retryId: string | null) => void;
	/** Stops the original clip before the microphone opens. */
	onBeforeRecord: () => void;
}) {
	const recorder = useMicRecorder();
	const generateUploadUrl = useMutation(api.retryRecordings.generateUploadUrl);
	const attach = useMutation(api.retryRecordings.attach);
	const remove = useMutation(api.retryRecordings.remove);

	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	const take = recorder.recording;
	const clearTake = recorder.clear;

	// Keep the object URL alive exactly as long as the take it points at.
	useEffect(() => {
		if (take === null) {
			setPreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(take.blob);
		setPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [take]);

	// A new card means a new take. Never carry one across.
	useEffect(() => {
		clearTake();
		setSaveError(null);
	}, [card._id, clearTake]);

	async function save() {
		if (take === null) return;
		setSaving(true);
		setSaveError(null);
		try {
			const uploadUrl = await generateUploadUrl({ reviewCardId: card._id });
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": take.mimeType },
				body: take.blob,
			});
			if (!response.ok) {
				throw new Error(`Upload rejected with ${response.status}`);
			}
			const body = (await response.json()) as { storageId?: string };
			if (typeof body.storageId !== "string") {
				throw new Error("Upload response had no storage ID");
			}
			await attach({
				reviewCardId: card._id,
				storageId: body.storageId as Parameters<typeof attach>[0]["storageId"],
				durationMs: take.durationMs,
			});
			recorder.clear();
		} catch (cause) {
			setSaveError(
				cause instanceof Error ? cause.message : "That take could not be saved.",
			);
		} finally {
			setSaving(false);
		}
	}

	const recording = recorder.status === "recording" || recorder.status === "stopping";

	return (
		<div className="flex flex-col gap-3">
			{!canRecord ? null : recorder.status === "unsupported" ? (
				<p className="paragraph-sm text-text-sub-600">
					This browser has no <code className="font-mono">MediaRecorder</code>,
					so retries cannot be recorded here.
				</p>
			) : (
				<div className="flex flex-wrap items-center gap-2">
					{recording ? (
						<Button.Root
							variant="error"
							size="xsmall"
							onClick={recorder.stop}
							aria-label="Stop recording"
						>
							<Button.Icon as={Square} />
							Stop
						</Button.Root>
					) : (
						<Button.Root
							variant="neutral"
							mode="stroke"
							size="xsmall"
							disabled={recorder.status === "requesting" || saving}
							onClick={() => {
								onBeforeRecord();
								recorder.start();
							}}
							aria-label="Record yourself saying this"
						>
							<Button.Icon as={Mic} />
							{recorder.status === "requesting"
								? "Waiting for the mic…"
								: take === null && card.retries.length === 0
									? "Record a retry"
									: "Record another"}
						</Button.Root>
					)}

					{recording ? (
						<>
							<span className="font-mono text-[11px] text-error-base">
								● {formatDuration(recorder.elapsedMs)}
							</span>
							{/* Peak level, so a muted or wrong microphone shows before saving. */}
							<span
								aria-hidden
								className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-weak-50"
							>
								<span
									className="block h-full rounded-full bg-error-base transition-[width] duration-75"
									style={{ width: `${Math.round(Math.min(1, recorder.level) * 100)}%` }}
								/>
							</span>
							<span className="paragraph-xs text-text-soft-400">
								stops at {MAX_RETRY_MS / 1000}s
							</span>
						</>
					) : null}
				</div>
			)}

			{canRecord && recorder.error ? (
				<p className="paragraph-xs text-error-base">{recorder.error}</p>
			) : null}

			{take !== null && previewUrl !== null ? (
				<div className="flex flex-col gap-2 rounded-xl bg-bg-weak-50 p-3 ring-1 ring-stroke-soft-200 ring-inset">
					<p className="label-xs text-text-strong-950">
						New take · {formatDuration(take.durationMs)}
					</p>
					{/* A local blob needs no auth, so it plays with native controls. */}
					<audio src={previewUrl} controls className="w-full">
						<track kind="captions" />
					</audio>
					<div className="flex flex-wrap items-center gap-2">
						<Button.Root size="xsmall" onClick={() => void save()} disabled={saving}>
							<Button.Icon as={Upload} />
							{saving ? "Saving…" : "Keep this take"}
						</Button.Root>
						<Button.Root
							variant="neutral"
							mode="stroke"
							size="xsmall"
							onClick={() => recorder.clear()}
							disabled={saving}
						>
							<Button.Icon as={X} />
							Discard
						</Button.Root>
					</div>
					{saveError ? (
						<p className="paragraph-xs text-error-base">{saveError}</p>
					) : null}
				</div>
			) : null}

			{card.retries.length === 0 ? (
				<p className="paragraph-xs text-text-soft-400">
					No saved retries for this card yet. Play the original, say it back,
					then listen to the two side by side.
				</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{card.retries.map((retry, index) => (
						<RetryRow
							key={retry._id}
							retry={retry}
							index={index}
							mine={retry.recordedBy === viewerId}
							selected={retry._id === selectedRetryId}
							playing={player.playing && player.activeKey === retry._id}
							canPlay={player.status === "ready" && retry._id === selectedRetryId}
							onPlay={() => {
								if (retry._id !== selectedRetryId) {
									onSelectRetry(retry._id);
									return;
								}
								if (player.playing) player.stop();
								else
									player.play({
										key: retry._id,
										startMs: 0,
										endMs: retry.durationMs,
									});
							}}
							onRemove={() => {
								if (retry._id === selectedRetryId) onSelectRetry(null);
								void remove({ retryRecordingId: retry._id });
							}}
						/>
					))}
				</ul>
			)}

			{player.status === "error" && selectedRetryId !== null ? (
				<p className="paragraph-xs text-error-base">
					{player.error ?? "That retry could not be loaded."}
				</p>
			) : null}
		</div>
	);
}

const TIME = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});

function RetryRow({
	retry,
	index,
	mine,
	selected,
	playing,
	canPlay,
	onPlay,
	onRemove,
}: {
	retry: RetryRecording;
	index: number;
	mine: boolean;
	selected: boolean;
	playing: boolean;
	/** Whether the shared player already holds this file. */
	canPlay: boolean;
	onPlay: () => void;
	onRemove: () => void;
}) {
	return (
		<li
			className={cn(
				"flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-inset transition-colors",
				selected
					? "bg-bg-white-0 ring-primary-base"
					: "bg-bg-white-0 ring-stroke-soft-200",
			)}
		>
			<button
				type="button"
				onClick={onPlay}
				aria-label={`Play take ${index + 1}`}
				className={cn(
					"inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 font-mono text-[11px] transition-colors",
					playing ? "text-primary-base" : "text-text-sub-600 hover:text-text-strong-950",
				)}
			>
				{playing ? <Square className="size-3" /> : <Play className="size-3" />}
				take {index + 1}
			</button>
			<span className="font-mono text-[11px] text-text-soft-400">
				{formatDuration(retry.durationMs)}
			</span>
			<span className="min-w-0 flex-1 truncate paragraph-xs text-text-soft-400">
				{selected && !canPlay ? "loading…" : TIME.format(new Date(retry.createdAt))}
			</span>
			{mine ? (
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Delete take ${index + 1}`}
					className="cursor-pointer rounded p-1 text-text-soft-400 transition-colors hover:bg-bg-weak-50 hover:text-error-base"
				>
					<Trash2 className="size-3.5" />
				</button>
			) : (
				<span className="paragraph-xs text-text-soft-400">partner</span>
			)}
		</li>
	);
}
