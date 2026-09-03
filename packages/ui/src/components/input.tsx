import * as React from "react";
import { cn } from "../utils/cn";

const Input = React.forwardRef<
	HTMLInputElement,
	React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, forwardedRef) => {
	return (
		<div
			className={cn(
				"group relative flex w-full overflow-hidden rounded-xl bg-bg-white-0 shadow-regular-xs",
				"transition duration-200 ease-out",
				"before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:ring-1 before:ring-inset before:ring-stroke-soft-200",
				"before:transition before:duration-200 before:ease-out",
				"has-[input:focus]:shadow-button-important-focus has-[input:focus]:before:ring-stroke-strong-950",
				"has-[input:disabled]:shadow-none has-[input:disabled]:before:ring-transparent",
			)}
		>
			<input
				ref={forwardedRef}
				className={cn(
					"w-full bg-transparent px-3 py-2.5 text-[16px] text-text-strong-950 outline-none sm:paragraph-sm",
					"placeholder:text-text-soft-400",
					"disabled:text-text-disabled-300 disabled:placeholder:text-text-disabled-300",
					className,
				)}
				{...rest}
			/>
		</div>
	);
});
Input.displayName = "Input";

export { Input as Root };
