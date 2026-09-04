"use client";

import * as Button from "@verbatim/ui/button";
import { cn } from "@verbatim/ui/cn";
import { Play, Square, VolumeX } from "lucide-react";
import { CLIP_PADDING_MS, formatClock } from "@/lib/clip";
import type { ClipPlayer } from "@/lib/use-clip-player";
import type { ReviewCard } from "./types";

/**
 * Plays the original lesson clip for one card.
 *
 * The clip window comes from `use-clip-player`, with the same padding and
 * offset handling the transcript viewer uses, so a line sounds the same here
 * as it does in the lesson.
 */
export function ClipPanel({
	card,
	player,
	onPlay,
}: {
	card: ReviewCard;
	player: ClipPlayer;
	onPlay: () => void;
}) {
	const clip = player.clipFor(card.line);

	if (card.session.audio === null || player.status === "absent") {
		return (
			<p className="flex items-center gap-2 paragraph-sm text-text-sub-600">
				<VolumeX className="size-4 shrink-0" />
				That lesson was captured without audio, so this card is text only.
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
						? "Loading that lesson's recording…"
						: "Preparing the recording…"}
				</p>
				<div className="h-1 w-full overflow-hidden rounded-full bg-bg-weak-50">
					<div
						className="h-full rounded-full bg-primary-base transition-[width] duration-200 ease-out"
						style={{ width: `${Math.round((player.progress ?? 0) * 100)}%` }}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				{player.playing ? (
					<Button.Root size="xsmall" onClick={player.stop} aria-label="Stop the original clip">
						<Button.Icon as={Square} />
						Stop
					</Button.Root>
				) : (
					<Button.Root
						size="xsmall"
						onClick={onPlay}
						disabled={!clip.available}
						aria-label="Play the original clip"
					>
						<Button.Icon as={Play} />
						Play original
					</Button.Root>
				)}
				<span
					className={cn(
						"font-mono text-[11px]",
						player.playing ? "text-primary-base" : "text-text-soft-400",
					)}
				>
					{clip.available
						? `${formatClock(card.line.startMs)} – ${formatClock(card.line.endMs)}`
						: "outside the recording"}
				</span>
			</div>

			{clip.available ? null : (
				<p className="paragraph-xs text-text-soft-400">
					This line was said before the tab was armed for capture, so there are
					no bytes behind it.
				</p>
			)}
			<p className="paragraph-xs text-text-soft-400">
				Includes {CLIP_PADDING_MS} ms either side of the caption timings.
			</p>
		</div>
	);
}
