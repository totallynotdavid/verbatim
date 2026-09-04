"use client";

import * as Button from "@verbatim/ui/button";
import { cn } from "@verbatim/ui/cn";
import * as Textarea from "@verbatim/ui/textarea";
import { useState } from "react";
import {
	MAX_RUBRIC_NOTE_LENGTH,
	RUBRIC_DIMENSIONS,
	RUBRIC_RATINGS,
	type RubricDimension,
	type RubricEntry,
	type RubricRating,
} from "@/lib/interview-types";

export type RubricValues = Record<RubricDimension, RubricEntry>;

export const EMPTY_RUBRIC: RubricValues = {
	structure: {},
	conciseness: {},
	tradeoffs: {},
	vocabulary: {},
};

/** Submits all four dimensions so a cleared one is stored as unassessed. */
export function RubricForm({
	initial,
	pending,
	error,
	onSubmit,
	onCancel,
}: {
	initial: RubricValues;
	pending: boolean;
	error: string | null;
	onSubmit: (values: RubricValues) => void;
	onCancel: () => void;
}) {
	const [values, setValues] = useState<RubricValues>(initial);

	function setEntry(dimension: RubricDimension, entry: RubricEntry) {
		setValues((current) => ({ ...current, [dimension]: entry }));
	}

	const dimensions = RUBRIC_DIMENSIONS.map((dimension) => ({
		...dimension,
		entry: values[dimension.key],
	}));
	const anyTooLong = dimensions.some(
		(dimension) => (dimension.entry.note ?? "").length > MAX_RUBRIC_NOTE_LENGTH,
	);
	const anyFilled = dimensions.some(
		(dimension) =>
			dimension.entry.rating !== undefined ||
			(dimension.entry.note ?? "").trim() !== "",
	);
	const canSubmit = anyFilled && !anyTooLong && !pending;

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!canSubmit) return;
				// Preserve unassessed dimensions as empty entries.
				const cleaned = {} as RubricValues;
				for (const dimension of RUBRIC_DIMENSIONS) {
					const entry = values[dimension.key];
					const note = (entry.note ?? "").trim();
					cleaned[dimension.key] = {
						...(entry.rating === undefined ? {} : { rating: entry.rating }),
						...(note === "" ? {} : { note }),
					};
				}
				onSubmit(cleaned);
			}}
		>
			{dimensions.map((dimension) => {
				const note = dimension.entry.note ?? "";
				return (
					<fieldset key={dimension.key} className="flex flex-col gap-1.5">
						<legend className="label-xs text-text-strong-950">
							{dimension.label}
						</legend>
						<p className="paragraph-xs text-text-soft-400">{dimension.hint}</p>

						<div className="mt-0.5 flex flex-wrap gap-1.5">
							{RUBRIC_RATINGS.map((rating) => {
								const selected = dimension.entry.rating === rating.value;
								return (
									<button
										key={rating.value}
										type="button"
										aria-pressed={selected}
										onClick={() =>
											setEntry(dimension.key, {
												...dimension.entry,
												// Allow clicking the selected rating to clear it.
												rating: selected
													? undefined
													: (rating.value as RubricRating),
											})
										}
										className={cn(
											"cursor-pointer rounded-full px-2.5 py-1 label-xs transition duration-200 ease-out",
											"ring-1 ring-inset",
											selected
												? "bg-bg-strong-950 text-text-white-0 ring-transparent"
												: "bg-bg-white-0 text-text-sub-600 ring-stroke-soft-200 hover:bg-bg-weak-50",
										)}
									>
										{rating.label}
									</button>
								);
							})}
						</div>

						<Textarea.Root
							value={note}
							hasError={note.length > MAX_RUBRIC_NOTE_LENGTH}
							onChange={(event) =>
								setEntry(dimension.key, {
									...dimension.entry,
									note: event.target.value,
								})
							}
							placeholder="What to do differently next time."
							className="min-h-16"
						/>
					</fieldset>
				);
			})}

			{error ? <p className="paragraph-xs text-error-base">{error}</p> : null}

			<div className="flex items-center justify-between gap-2">
				<span className="paragraph-xs text-text-soft-400">
					{anyFilled ? "" : "Rate or note at least one dimension."}
				</span>
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
						{pending ? "Saving…" : "Save feedback"}
					</Button.Root>
				</div>
			</div>
		</form>
	);
}
