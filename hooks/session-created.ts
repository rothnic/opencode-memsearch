import type { PluginInput } from "@opencode-ai/plugin";
import { signalSessionActivity } from "../lib/memory-queue";
import { isThrottled, type SessionInfo, shouldSkipSession } from "../state";

export const onSessionCreated = async (event: any, ctx: PluginInput) => {
	console.log("[memsearch] session.created hook triggered", {
		eventKeys: Object.keys(event || {}),
		sessionId: event?.sessionID || event?.sessionId,
		projectId: ctx?.project?.id,
		directory: ctx?.directory,
	});

	const session: SessionInfo | undefined = event?.properties?.info;
	const sessionId = session?.id ?? event?.sessionID ?? event?.sessionId;

	console.log("[memsearch] Extracted sessionId:", sessionId);

	if (shouldSkipSession(sessionId, session)) {
		console.log("[memsearch] Skipping session:", sessionId);
		return;
	}

	if (isThrottled(sessionId)) {
		console.log("[memsearch] Session throttled:", sessionId);
		return;
	}

	console.log("[memsearch] Signaling queue for session:", sessionId);
	await signalSessionActivity(
		"session-created",
		sessionId,
		ctx.project?.id || ctx.directory,
		ctx.directory,
		{ sessionTitle: session?.title },
	);
	console.log("[memsearch] Queue signaled successfully");
};

export default { onSessionCreated };
