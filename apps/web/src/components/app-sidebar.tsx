"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@verbatim/backend/convex/_generated/api";
import * as Avatar from "@verbatim/ui/avatar";
import { Sidebar, type SidebarNavItem } from "@verbatim/ui/sidebar";
import { useQuery } from "convex/react";
import {
	LayoutDashboard,
	LineChart,
	LogOut,
	MessageCircleQuestion,
	Puzzle,
	Repeat2,
	Settings,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const NAV_ITEMS: SidebarNavItem[] = [
	{ id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
	{ id: "review", label: "Review", href: "/dashboard/review", icon: Repeat2 },
	{ id: "trends", label: "Trends", href: "/dashboard/trends", icon: LineChart },
	{
		id: "questions",
		label: "Questions",
		href: "/dashboard/questions",
		icon: MessageCircleQuestion,
	},
	{ id: "settings", label: "Settings", href: "/dashboard/settings", icon: Settings },
	{
		id: "extension",
		label: "Extension",
		href: "/extension/connect",
		icon: Puzzle,
	},
];

export function AppSidebar() {
	const viewer = useQuery(api.users.viewer);
	const { signOut } = useAuthActions();
	const pathname = usePathname();

	// Longest matching route wins for nested dashboard pages.
	const activeId = NAV_ITEMS.filter((item) => pathname.startsWith(item.href)).sort(
		(a, b) => b.href.length - a.href.length,
	)[0]?.id;

	return (
		<Sidebar
			navItems={NAV_ITEMS}
			activeId={activeId}
			productName="Verbatim"
			logo={<Logo className="-ml-0.5 size-7" />}
			footer={
				<div className="flex items-center gap-2">
					<Avatar.Root className="size-6">
						{viewer?.image ? (
							<Avatar.Image src={viewer.image} alt={viewer.name ?? ""} />
						) : null}
						<Avatar.Fallback>{viewer?.name?.[0] ?? "?"}</Avatar.Fallback>
					</Avatar.Root>
					<button
						type="button"
						onClick={() => void signOut()}
						className="text-text-sub-600 hover:text-text-strong-950"
						aria-label="Sign out"
					>
						<LogOut className="size-4" />
					</button>
				</div>
			}
		/>
	);
}
