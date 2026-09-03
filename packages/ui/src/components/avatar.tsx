import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as React from "react";
import { cn } from "../utils/cn";

const AvatarRoot = React.forwardRef<
	React.ComponentRef<typeof AvatarPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...rest }, forwardedRef) => (
	<AvatarPrimitive.Root
		ref={forwardedRef}
		className={cn(
			"relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-weak-50 text-label-xs text-text-sub-600",
			className,
		)}
		{...rest}
	/>
));
AvatarRoot.displayName = "AvatarRoot";

const AvatarImage = React.forwardRef<
	React.ComponentRef<typeof AvatarPrimitive.Image>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...rest }, forwardedRef) => (
	<AvatarPrimitive.Image
		ref={forwardedRef}
		className={cn("size-full object-cover", className)}
		{...rest}
	/>
));
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
	React.ComponentRef<typeof AvatarPrimitive.Fallback>,
	React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...rest }, forwardedRef) => (
	<AvatarPrimitive.Fallback
		ref={forwardedRef}
		className={cn(
			"flex size-full items-center justify-center font-medium uppercase",
			className,
		)}
		{...rest}
	/>
));
AvatarFallback.displayName = "AvatarFallback";

export { AvatarRoot as Root, AvatarImage as Image, AvatarFallback as Fallback };
