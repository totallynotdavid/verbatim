import * as React from "react";
import { cn } from "../utils/cn";

const DetailRoot = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, forwardedRef) => (
	<div
		ref={forwardedRef}
		className={cn("flex h-full min-h-0 flex-col", className)}
		{...rest}
	/>
));
DetailRoot.displayName = "DetailRoot";

const DetailHeader = React.forwardRef<
	HTMLElement,
	React.HTMLAttributes<HTMLElement> & {
		title: React.ReactNode;
		subtitle?: React.ReactNode;
		back?: React.ReactNode;
		actions?: React.ReactNode;
	}
>(({ title, subtitle, back, actions, className, children, ...rest }, forwardedRef) => (
	<header
		ref={forwardedRef}
		className={cn(
			"shrink-0 border-stroke-soft-200 border-b px-6 dark:border-white/10",
			className,
		)}
		{...rest}
	>
		<div className="flex min-h-14 items-center gap-3 py-2.5">
			{back}
			<div className="min-w-0 flex-1">
				<h1 className="truncate label-sm text-text-strong-950">{title}</h1>
				{subtitle ? (
					<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 paragraph-xs text-text-sub-600">
						{subtitle}
					</div>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			) : null}
		</div>
		{children}
	</header>
));
DetailHeader.displayName = "DetailHeader";

const DetailSplit = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, forwardedRef) => (
	<div
		ref={forwardedRef}
		className={cn(
			"grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 overflow-y-auto p-4",
			"lg:grid-cols-12 lg:gap-5 lg:overflow-hidden",
			className,
		)}
		{...rest}
	/>
));
DetailSplit.displayName = "DetailSplit";

const DetailMain = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, forwardedRef) => (
	<div
		ref={forwardedRef}
		className={cn(
			"flex min-h-0 flex-col overflow-hidden rounded-2xl bg-bg-white-0 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset",
			"lg:col-span-8",
			className,
		)}
		{...rest}
	/>
));
DetailMain.displayName = "DetailMain";

const DetailSide = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, forwardedRef) => (
	<div
		ref={forwardedRef}
		className={cn(
			"flex min-h-0 flex-col gap-4 lg:col-span-4 lg:overflow-y-auto",
			className,
		)}
		{...rest}
	/>
));
DetailSide.displayName = "DetailSide";

const DetailCard = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode }
>(({ title, className, children, ...rest }, forwardedRef) => (
	<section
		ref={forwardedRef}
		className={cn(
			"rounded-2xl bg-bg-white-0 p-4 shadow-regular-xs ring-1 ring-stroke-soft-200 ring-inset",
			className,
		)}
		{...rest}
	>
		{title ? (
			<h2 className="mb-3 subheading-xs text-text-soft-400 uppercase">{title}</h2>
		) : null}
		{children}
	</section>
));
DetailCard.displayName = "DetailCard";

export {
	DetailRoot as Root,
	DetailHeader as Header,
	DetailSplit as Split,
	DetailMain as Main,
	DetailSide as Side,
	DetailCard as Card,
};
