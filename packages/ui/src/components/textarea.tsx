import * as React from "react";
import { cn } from "../utils/cn";

const Textarea = React.forwardRef<
	HTMLTextAreaElement,
	React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
>(({ className, hasError, disabled, ...rest }, forwardedRef) => {
	return (
		<textarea
			ref={forwardedRef}
			disabled={disabled}
			className={cn(
				"block w-full resize-none paragraph-sm text-text-strong-950 outline-none",
				"min-h-20 rounded-xl bg-bg-white-0 px-3 py-2.5 shadow-regular-xs",
				"ring-1 ring-stroke-soft-200 ring-inset",
				"transition duration-200 ease-out",
				!disabled && [
					"placeholder:select-none placeholder:text-text-soft-400",
					"hover:[&:not(:focus)]:bg-bg-weak-50",
				],
				!hasError &&
					"focus:shadow-button-important-focus focus:ring-stroke-strong-950",
				hasError && "ring-error-base focus:shadow-button-error-focus focus:ring-error-base",
				disabled &&
					"bg-bg-weak-50 text-text-disabled-300 ring-transparent placeholder:text-text-disabled-300",
				className,
			)}
			{...rest}
		/>
	);
});
Textarea.displayName = "Textarea";

function CharCounter({
	current,
	max,
	className,
}: { current: number; max: number } & React.HTMLAttributes<HTMLSpanElement>) {
	return (
		<span
			className={cn(
				"subheading-2xs text-text-soft-400",
				current > max && "text-error-base",
				className,
			)}
		>
			{current}/{max}
		</span>
	);
}
CharCounter.displayName = "TextareaCharCounter";

export { Textarea as Root, CharCounter };
