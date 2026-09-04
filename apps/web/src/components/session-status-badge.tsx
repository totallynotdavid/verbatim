import * as StatusBadge from "@verbatim/ui/status-badge";

type SessionStatus = "recording" | "processing" | "ready" | "incomplete";

const PRESENTATION: Record<
	SessionStatus,
	{ status: "completed" | "pending" | "failed" | "disabled"; label: string }
> = {
	recording: { status: "pending", label: "Recording" },
	processing: { status: "pending", label: "Processing" },
	ready: { status: "completed", label: "Ready" },
	incomplete: { status: "disabled", label: "No recording" },
};

export function SessionStatusBadge({
	status,
	variant = "light",
}: {
	status: SessionStatus;
	variant?: "light" | "stroke";
}) {
	const { status: tone, label } = PRESENTATION[status];
	return (
		<StatusBadge.Root status={tone} variant={variant}>
			<StatusBadge.Dot className={status === "recording" ? "animate-pulse" : undefined} />
			{label}
		</StatusBadge.Root>
	);
}
