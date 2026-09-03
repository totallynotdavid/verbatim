import { cn } from "@verbatim/ui/cn";

export function Logo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 32 32"
			className={cn("size-8", className)}
			aria-hidden="true"
		>
			<rect width="32" height="32" rx="9" className="fill-primary-base" />
			<path
				d="M9 10.5 16 21l7-10.5"
				fill="none"
				stroke="white"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M9 21.5h14"
				fill="none"
				stroke="white"
				strokeWidth="2.5"
				strokeLinecap="round"
				opacity="0.55"
			/>
		</svg>
	);
}
