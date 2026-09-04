"use client";

import * as React from "react";
import { cn } from "../utils/cn";

/** Pixels from the viewport edge that still count as visible. */
const IN_VIEW_SLACK_PX = 24;

type ConversationRootProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"role"
> & {
	label: string;
	/** Transcript line to keep in view. */
	followId?: string | null;
	jumpLabel?: string;
	viewportClassName?: string;
};

const ConversationRoot = React.forwardRef<HTMLDivElement, ConversationRootProps>(
	(
		{
			label,
			followId,
			jumpLabel = "Jump to the current line",
			className,
			viewportClassName,
			children,
			...rest
		},
		forwardedRef,
	) => {
		const viewportRef = React.useRef<HTMLDivElement>(null);
		const [offScreen, setOffScreen] = React.useState(false);

		const followedElement = React.useCallback(() => {
			const viewport = viewportRef.current;
			if (!viewport || !followId) return null;
			return viewport.querySelector<HTMLElement>(
				`[data-conversation-item="${CSS.escape(followId)}"]`,
			);
		}, [followId]);

		const measure = React.useCallback(() => {
			const viewport = viewportRef.current;
			const element = followedElement();
			if (!viewport || !element) {
				setOffScreen(false);
				return;
			}
			const view = viewport.getBoundingClientRect();
			const item = element.getBoundingClientRect();
			setOffScreen(
				item.bottom < view.top + IN_VIEW_SLACK_PX ||
					item.top > view.bottom - IN_VIEW_SLACK_PX,
			);
		}, [followedElement]);

		const scrollToFollowed = React.useCallback(
			(behavior: ScrollBehavior) => {
				followedElement()?.scrollIntoView({ behavior, block: "center" });
			},
			[followedElement],
		);

		// Avoid moving a line that is already visible.
		React.useEffect(() => {
			if (!followId) return;
			const viewport = viewportRef.current;
			const element = followedElement();
			if (!viewport || !element) return;
			const view = viewport.getBoundingClientRect();
			const item = element.getBoundingClientRect();
			if (item.top < view.top || item.bottom > view.bottom) {
				element.scrollIntoView({ behavior: "smooth", block: "center" });
			}
			measure();
		}, [followId, followedElement, measure]);

		return (
		<div
				ref={forwardedRef}
				className={cn("relative flex min-h-0 flex-1 flex-col", className)}
				{...rest}
			>
				<div
					ref={viewportRef}
					onScroll={measure}
					role="log"
					aria-label={label}
					aria-relevant="additions"
					tabIndex={0}
					className={cn(
						"min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 outline-none",
						viewportClassName,
					)}
				>
					{children}
				</div>

				{offScreen ? (
					<div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
						<button
							type="button"
							onClick={() => scrollToFollowed("smooth")}
							className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-bg-white-0 px-3 label-xs text-text-strong-950 shadow-regular-md ring-1 ring-stroke-soft-200 ring-inset transition-colors hover:bg-bg-weak-50"
						>
							{jumpLabel}
						</button>
					</div>
				) : null}
			</div>
		);
	},
);
ConversationRoot.displayName = "ConversationRoot";

type ConversationItemProps = React.HTMLAttributes<HTMLDivElement> & {
	itemId: string;
	/** Whether this line belongs to the current user. */
	mine?: boolean;
	/** Whether this starts a speaker run. */
	startsGroup?: boolean;
};

const ConversationItem = React.forwardRef<HTMLDivElement, ConversationItemProps>(
	({ itemId, mine, startsGroup, className, children, ...rest }, forwardedRef) => (
		<div
			ref={forwardedRef}
			data-conversation-item={itemId}
			className={cn(
				"flex w-full flex-col",
				mine ? "items-end" : "items-start",
				startsGroup ? "mt-4 first:mt-0" : "mt-1",
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	),
);
ConversationItem.displayName = "ConversationItem";

type ConversationBubbleProps = React.HTMLAttributes<HTMLDivElement> & {
	mine?: boolean;
	/** Whether this is the selected item. */
	active?: boolean;
};

/** Keep transcript text selectable. Actions are rendered separately. */
const ConversationBubble = React.forwardRef<
	HTMLDivElement,
	ConversationBubbleProps
>(({ mine, active, className, children, ...rest }, forwardedRef) => (
	<div
		ref={forwardedRef}
		className={cn(
			"min-w-0 max-w-[90%] rounded-2xl px-4 py-3 paragraph-sm leading-relaxed",
			"bg-bg-white-0 text-text-strong-950 ring-1 ring-stroke-soft-200 ring-inset",
			"transition duration-200 ease-out",
			mine ? "rounded-br-xs" : "rounded-bl-xs",
			active
				? "shadow-regular-md ring-2 ring-primary-base"
				: "hover:ring-stroke-sub-300",
			className,
		)}
		{...rest}
	>
		{children}
	</div>
));
ConversationBubble.displayName = "ConversationBubble";

function ConversationMeta({
	mine,
	className,
	children,
	...rest
}: React.HTMLAttributes<HTMLParagraphElement> & { mine?: boolean }) {
	return (
		<p
			className={cn(
				"mt-1 font-mono text-[11px] text-text-soft-400",
				mine ? "mr-1" : "ml-1",
				className,
			)}
			{...rest}
		>
			{children}
		</p>
	);
}
ConversationMeta.displayName = "ConversationMeta";

export {
	ConversationRoot as Root,
	ConversationItem as Item,
	ConversationBubble as Bubble,
	ConversationMeta as Meta,
};
