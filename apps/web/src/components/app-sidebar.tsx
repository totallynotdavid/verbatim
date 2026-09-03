"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@verbatim/backend/convex/_generated/api";
import * as Avatar from "@verbatim/ui/avatar";
import { Sidebar, type SidebarNavItem } from "@verbatim/ui/sidebar";
import { useQuery } from "convex/react";
import { LayoutDashboard, LogOut, Puzzle, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const NAV_ITEMS: SidebarNavItem[] = [
	{ id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
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

	const activeId = NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.id;

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
