"use client";

import * as Button from "@verbatim/ui/button";
import { ChevronLeft, ChevronRight, RotateCcw, Square } from "lucide-react";
import { CLIP_PADDING_MS, formatClock } from "@/lib/clip";
import type { ClipPlayer } from "@/lib/use-clip-player";
import type { ReviewLine } from "./types";

export function AudioPanel({
	player,
	activeLine,
	activeIndex,
	lineCount,
	onStep,
	onReplay,
}: {
	player: ClipPlayer;
	activeLine: ReviewLine | null;
	activeIndex: number;
	lineCount: number;
	onStep: (delta: -1 | 1) => void;
	onReplay: () => void;
}) {
	const clip = activeLine ? player.clipFor(activeLine) : null;

	if (player.status === "absent") {
		return (
			<p className="paragraph-sm text-text-sub-600">
				This lesson has no recording, so the transcript is text only. A lesson
				closed as <span className="text-text-strong-950">No recording</span>{" "}
				never had audio attached.
			</p>
		);
	}

	if (player.status === "error") {
		return (
			<p className="paragraph-sm text-error-base">
				{player.error ?? "The recording could not be loaded."}
			</p>
		);
	}

	if (player.status !== "ready") {
		return (
			<div className="flex flex-col gap-2">
				<p className="paragraph-sm text-text-sub-600">
					{player.status === "downloading"
						? "Loading the recording…"
						: "Preparing the recording…"}
				</p>
				<div className="h-1 w-full overflow-hidden rounded-full bg-bg-weak-50">
					<div
						className="h-full rounded-full bg-primary-base transition-[width] duration-200 ease-out"
						style={{ width: `${Math.round((player.progress ?? 0) * 100)}%` }}
					/>
				</div>
				<p className="paragraph-xs text-text-soft-400">
					The whole file is fetched once, so every line you click afterwards
					plays without another request.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<Button.Root
					variant="neutral"
					mode="stroke"
					size="xsmall"
					aria-label="Previous line"
					disabled={activeIndex <= 0}
					onClick={() => onStep(-1)}
				>
					<Button.Icon as={ChevronLeft} />
					Prev
				</Button.Root>

				{player.playing ? (
					<Button.Root size="xsmall" onClick={player.stop} aria-label="Stop">
						<Button.Icon as={Square} />
						Stop
					</Button.Root>
				) : (
					<Button.Root
						size="xsmall"
						onClick={onReplay}
						disabled={activeLine === null || clip?.available !== true}
						aria-label="Replay this line"
					>
						<Button.Icon as={RotateCcw} />
						Replay
					</Button.Root>
				)}

				<Button.Root
					variant="neutral"
					mode="stroke"
					size="xsmall"
					aria-label="Next line"
					disabled={activeIndex < 0 || activeIndex >= lineCount - 1}
					onClick={() => onStep(1)}
				>
					Next
					<Button.Icon as={ChevronRight} />
				</Button.Root>
			</div>

			{activeLine === null ? (
				<p className="paragraph-sm text-text-sub-600">
					Click any line to hear exactly how it was said.
				</p>
			) : (
				<>
					<p className="line-clamp-3 paragraph-sm text-text-strong-950">
						{activeLine.text}
					</p>
					<dl className="flex flex-col gap-1 font-mono text-[11px] text-text-soft-400">
						<div className="flex justify-between gap-3">
							<dt>line</dt>
							<dd className="text-text-sub-600">
								{activeIndex + 1} of {lineCount}
							</dd>
						</div>
						<div className="flex justify-between gap-3">
							<dt>said at</dt>
							<dd className="text-text-sub-600">
								{formatClock(activeLine.startMs)} –{" "}
								{formatClock(activeLine.endMs)}
							</dd>
						</div>
						<div className="flex justify-between gap-3">
							<dt>clip</dt>
							<dd className="text-text-sub-600">
								{clip?.available
									? `${clip.start.toFixed(2)}s – ${clip.end.toFixed(2)}s in the file`
									: "outside the recording"}
							</dd>
						</div>
						{player.positionMs !== null && player.playing ? (
							<div className="flex justify-between gap-3">
								<dt>playhead</dt>
								<dd className="text-primary-base">
									{formatClock(player.positionMs)}
								</dd>
							</div>
						) : null}
					</dl>
				</>
			)}

			<p className="paragraph-xs text-text-soft-400">
				Clips include {CLIP_PADDING_MS} ms either side of the caption timings,
				because Meet stamps captions when the text settles rather than when the
				words start.
			</p>
		</div>
	);
}
