import type { PluginInput } from "@opencode-ai/plugin";
import { signalSessionActivity } from "../lib/queue/memory-queue";
import { isThrottled, type SessionInfo, shouldSkipSession } from "../lib/state";

export const onSessionCreated = async (event: any, ctx: PluginInput) => {
	const session: SessionInfo | undefined = event?.properties?.info;
	const sessionId = session?.id ?? event?.sessionID ?? event?.sessionId;

	if (shouldSkipSession(sessionId, session)) {
		return;
	}

	if (isThrottled(sessionId)) {
		return;
	}

	await signalSessionActivity(
		"session-created",
		sessionId,
		ctx.project?.id || ctx.directory,
		ctx.directory,
		{ sessionTitle: session?.title },
	);
};

export default { onSessionCreated };
