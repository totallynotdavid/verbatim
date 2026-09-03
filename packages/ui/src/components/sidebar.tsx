"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../utils/cn";
import { ThemeToggle } from "./theme-toggle";

export interface SidebarNavItem {
	id: string;
	label: string;
	href: string;
	icon: LucideIcon;
}

const CRISP_TRANSITION = {
	type: "spring",
	bounce: 0,
	duration: 0.24,
} as const;

export function Sidebar({
	navItems,
	activeId,
	logo,
	productName,
	footer,
}: {
	navItems: SidebarNavItem[];
	activeId?: string;
	logo?: React.ReactNode;
	productName: string;
	footer?: React.ReactNode;
}) {
	const [hoveredId, setHoveredId] = React.useState<string | null>(null);
	const reduceMotion = useReducedMotion();

	return (
		<aside className="hidden h-full w-[13.5rem] shrink-0 flex-col border-stroke-soft-200 border-r md:flex dark:border-white/10">
			<div className="flex h-11 shrink-0 items-center gap-1.5 px-3">
				{logo}
				<span className="-ml-1 font-semibold text-[13px] text-text-strong-950 dark:text-white">
					{productName}
				</span>
			</div>
			<nav
				className="min-h-0 flex-1 overflow-hidden px-2 pb-3 pt-1"
				onMouseLeave={() => setHoveredId(null)}
			>
				<ul className="flex flex-col gap-0.5">
					{navItems.map((item) => {
						const active = item.id === activeId;
						const isHovered = item.id === hoveredId;
						const Icon = item.icon;
						const itemStateClassName =
							active || isHovered
								? "text-text-strong-950 dark:text-white"
								: "text-text-sub-600 dark:text-white/60";

						return (
							<li key={item.id} className="relative">
								<a
									href={item.href}
									onMouseEnter={() => setHoveredId(item.id)}
									className="group relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left"
								>
									{active && (
										<motion.div
											layoutId={
												reduceMotion ? undefined : "sidebar-active-indicator"
											}
											className="absolute inset-0 rounded-lg bg-bg-weak-50 dark:bg-white/[0.06]"
											transition={
												reduceMotion ? { duration: 0 } : CRISP_TRANSITION
											}
										/>
									)}

									<AnimatePresence>
										{isHovered && !active && (
											<motion.div
												layoutId={
													reduceMotion ? undefined : "sidebar-hover-indicator"
												}
												className="absolute inset-0 rounded-lg bg-bg-weak-50/70 dark:bg-white/[0.04]"
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												exit={{ opacity: 0 }}
												transition={
													reduceMotion ? { duration: 0 } : CRISP_TRANSITION
												}
											/>
										)}
									</AnimatePresence>

									<Icon
										className={cn(
											"relative z-10 size-4 shrink-0 transition-colors duration-150",
											itemStateClassName,
										)}
									/>
									<span
										className={cn(
											"relative z-10 truncate font-medium text-[13px] transition-colors duration-150",
											itemStateClassName,
										)}
									>
										{item.label}
									</span>
								</a>
							</li>
						);
					})}
				</ul>
			</nav>
			<div className="mt-auto flex shrink-0 items-center justify-between gap-2 px-3 py-3">
				{footer}
				<ThemeToggle />
			</div>
		</aside>
	);
}
