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

/**
 * Cleanup old state entries to prevent unbounded memory growth.
 * Removes entries older than maxAgeMs (default 24 hours).
 */
export function cleanupOldState(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
	const cutoff = Date.now() - maxAgeMs;
	let cleaned = 0;

	// Clean up lastSessionProcessTime entries
	for (const [id, time] of state.lastSessionProcessTime) {
		if (time < cutoff) {
			state.lastSessionProcessTime.delete(id);
			state.summarizedSessions.delete(id);
			cleaned++;
		}
	}

	// Also clean summarizedSessions that don't have a corresponding time entry
	for (const id of state.summarizedSessions) {
		if (!state.lastSessionProcessTime.has(id)) {
			state.summarizedSessions.delete(id);
			cleaned++;
		}
	}

	if (cleaned > 0) {
		console.log(`[memsearch] Cleaned up ${cleaned} old state entries`);
	}
}
