"use client";

import * as Button from "@verbatim/ui/button";
import * as Textarea from "@verbatim/ui/textarea";
import { cn } from "@verbatim/ui/cn";
import { useState } from "react";
import {
	ANNOTATION_TYPES,
	type AnnotationType,
} from "@/lib/annotation-types";

const MAX_NOTE_LENGTH = 2000;

export function AnnotationForm({
	initialType = "pronunciation",
	initialNote = "",
	quote,
	submitLabel,
	pending,
	error,
	onSubmit,
	onCancel,
}: {
	initialType?: AnnotationType;
	initialNote?: string;
	/** Selected text for an anchored note. */
	quote?: string | null;
	submitLabel: string;
	pending: boolean;
	error: string | null;
	onSubmit: (values: { type: AnnotationType; note: string }) => void;
	onCancel: () => void;
}) {
	const [type, setType] = useState<AnnotationType>(initialType);
	const [note, setNote] = useState(initialNote);

	const trimmed = note.trim();
	const tooLong = trimmed.length > MAX_NOTE_LENGTH;
	const canSubmit = trimmed.length > 0 && !tooLong && !pending;

	return (
		<form
			className="flex w-[min(22rem,80vw)] flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (canSubmit) onSubmit({ type, note: trimmed });
			}}
		>
			{quote ? (
				<p className="rounded-lg bg-bg-weak-50 px-2.5 py-1.5 paragraph-xs text-text-sub-600">
					<span className="text-text-soft-400">Note on </span>
					<span className="text-text-strong-950">“{quote}”</span>
				</p>
			) : null}

			<fieldset className="flex flex-col gap-1.5">
				<legend className="mb-1.5 subheading-2xs text-text-soft-400 uppercase">
					Type
				</legend>
				<div className="flex flex-wrap gap-1.5">
					{ANNOTATION_TYPES.map((option) => (
						<button
							key={option.value}
							type="button"
							title={option.hint}
							aria-pressed={type === option.value}
							onClick={() => setType(option.value)}
							className={cn(
								"cursor-pointer rounded-full px-2.5 py-1 label-xs transition duration-200 ease-out",
								"ring-1 ring-inset",
								type === option.value
									? "bg-bg-strong-950 text-text-white-0 ring-transparent"
									: "bg-bg-white-0 text-text-sub-600 ring-stroke-soft-200 hover:bg-bg-weak-50",
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			</fieldset>

			<label className="flex flex-col gap-1.5">
				<span className="subheading-2xs text-text-soft-400 uppercase">Note</span>
				<Textarea.Root
					autoFocus
					value={note}
					hasError={tooLong}
					onChange={(event) => setNote(event.target.value)}
					placeholder="What should they work on here?"
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							if (canSubmit) onSubmit({ type, note: trimmed });
						}
					}}
				/>
			</label>

			{error ? <p className="paragraph-xs text-error-base">{error}</p> : null}

			<div className="flex items-center justify-between gap-2">
				<Textarea.CharCounter current={trimmed.length} max={MAX_NOTE_LENGTH} />
				<div className="flex items-center gap-2">
					<Button.Root
						type="button"
						variant="neutral"
						mode="stroke"
						size="xsmall"
						onClick={onCancel}
					>
						Cancel
					</Button.Root>
					<Button.Root type="submit" size="xsmall" disabled={!canSubmit}>
						{pending ? "Saving…" : submitLabel}
					</Button.Root>
				</div>
			</div>
		</form>
	);
}
