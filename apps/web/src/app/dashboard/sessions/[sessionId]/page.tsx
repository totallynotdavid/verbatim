import { ReviewView } from "./review-view";

export default async function LessonSessionPage({
	params,
}: {
	params: Promise<{ sessionId: string }>;
}) {
	const { sessionId } = await params;
	return <ReviewView sessionId={sessionId} />;
}
