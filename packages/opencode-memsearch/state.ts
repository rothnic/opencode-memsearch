export interface SessionInfo {
	id?: string;
	parentID?: string;
	projectID?: string;
	directory?: string;
	title?: string;
}

export const state = {
	watcherRunning: false,
	summarizedSessions: new Set<string>(),
	lastSessionProcessTime: new Map<string, number>(),
	MIN_PROCESS_INTERVAL_MS: 60000,
};

export function shouldSkipSession(
	sessionId: string,
	session?: SessionInfo,
): boolean {
	if (!sessionId) return true;
	if (session?.parentID) return true;
	if (sessionId.includes("subagent")) return true;
	if (sessionId.includes("task-")) return true;
	if (sessionId.includes("background-")) return true;

	return false;
}

export function isThrottled(sessionId: string): boolean {
	const lastTime = state.lastSessionProcessTime.get(sessionId);
	if (!lastTime) return false;
	const elapsed = Date.now() - lastTime;
	return elapsed < state.MIN_PROCESS_INTERVAL_MS;
}

export function markSessionProcessed(sessionId: string) {
	state.lastSessionProcessTime.set(sessionId, Date.now());
}
