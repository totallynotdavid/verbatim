"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { cn } from "../utils/cn";

const OPTIONS = [
	{ value: "system", label: "System theme", Icon: Laptop },
	{ value: "light", label: "Light mode", Icon: Sun },
	{ value: "dark", label: "Dark mode", Icon: Moon },
] as const;

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = React.useState(false);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div className="inline-flex items-center rounded-full border border-stroke-soft-200 bg-bg-weak-50 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
			{OPTIONS.map(({ value, label, Icon }) => (
				<button
					key={value}
					type="button"
					onClick={() => setTheme(value)}
					className={cn(
						"flex h-[21px] w-[21px] items-center justify-center rounded-full transition-all duration-200",
						mounted && theme === value
							? "bg-white text-black shadow-sm dark:bg-white dark:text-black"
							: "text-text-sub-600 hover:text-text-strong-950 dark:text-white/55 dark:hover:text-white/80",
					)}
					aria-label={label}
				>
					<Icon className="size-3" />
				</button>
			))}
		</div>
	);
}
