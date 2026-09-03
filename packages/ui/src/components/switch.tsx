"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "../utils/cn";

interface SwitchProps
	extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
	checkedColor?: string;
	isPending?: boolean;
	loading?: boolean;
}

const Switch = React.forwardRef<
	React.ComponentRef<typeof SwitchPrimitives.Root>,
	SwitchProps
>(
	(
		{
			className,
			disabled,
			checkedColor,
			isPending: isPendingProp,
			loading,
			...rest
		},
		forwardedRef,
	) => {
		const isPending = isPendingProp || loading;
		const [isChecked, setIsChecked] = React.useState(
			rest.defaultChecked ?? false,
		);

		const checked = rest.checked !== undefined ? rest.checked : isChecked;

		const handleCheckedChange = (newChecked: boolean) => {
			setIsChecked(newChecked);
			rest.onCheckedChange?.(newChecked);
		};

		return (
			<SwitchPrimitives.Root
				className={cn(
					"group/switch block h-5 w-8 shrink-0 p-0.5 outline-none focus:outline-none",
					className,
				)}
				ref={forwardedRef}
				disabled={disabled}
				checked={rest.checked}
				defaultChecked={rest.defaultChecked}
				onCheckedChange={handleCheckedChange}
			>
				<div
					className={cn(
						"h-4 w-7 rounded-full bg-bg-soft-200 p-0.5 outline-none",
						"transition duration-200 ease-out",
						!disabled && [
							"group-hover/switch:bg-bg-sub-300",
							"group-focus-visible/switch:bg-bg-sub-300",
							"group-active/switch:bg-bg-soft-200",
							"group-focus/switch:outline-none",
							!checkedColor && [
								"group-data-[state=checked]/switch:bg-primary-base",
								"group-hover:data-[state=checked]/switch:bg-primary-darker",
								"group-active:data-[state=checked]/switch:bg-primary-base",
							],
						],
						disabled && [
							"bg-bg-white-0 p-[3px] ring-1 ring-stroke-soft-200 ring-inset",
						],
					)}
					style={
						checkedColor && !disabled && checked
							? { backgroundColor: checkedColor }
							: undefined
					}
				>
					<SwitchPrimitives.Thumb
						className={cn(
							"pointer-events-none relative block size-3",
							"transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
							"data-[state=checked]:translate-x-3",
							isPending && "scale-95 animate-pulse opacity-75",
							!disabled && [
								"before:-translate-x-1/2 before:absolute before:inset-y-0 before:left-1/2 before:w-3 before:rounded-full before:bg-static-white",
								"before:[mask:--mask]",
								"after:-translate-x-1/2 after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:rounded-full after:shadow-switch-thumb",
								"group-active/switch:scale-[.833]",
							],
							disabled && ["size-2.5 rounded-full bg-bg-soft-200 shadow-none"],
						)}
						style={{
							["--mask" as any]:
								"radial-gradient(circle farthest-side at 50% 50%, #0000 1.95px, #000 2.05px 100%) 50% 50%/100% 100% no-repeat",
						}}
					/>
				</div>
			</SwitchPrimitives.Root>
		);
	},
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch as Root };
