import type { PluginInput } from "@opencode-ai/plugin";
import { MemsearchCLI } from "../cli-wrapper";
import { loadConfig } from "../config";
import { indexSessions } from "../lib/session-indexer";
import { state } from "../state";

const cli = new MemsearchCLI();

export const onSessionCreated = async (event: any, ctx: PluginInput) => {
	const isAvailable = await cli.checkAvailability();
	if (!isAvailable) {
		console.warn(
			"memsearch CLI not found. Please install it with: pip install memsearch. Plugin functionality will be limited.",
		);
		return;
	}

	try {
		const config = await loadConfig(ctx.directory);

		if (!state.watcherRunning) {
			state.watcherRunning = true;
			(async () => {
				try {
					await cli.watch(ctx.directory);
				} catch (err) {
					state.watcherRunning = false;
					console.error("memsearch auto-watcher exited:", err);
				}
			})();
		}

		(async () => {
			try {
				await cli.index(ctx.directory, { recursive: true });
			} catch (err) {
				console.error("memsearch auto-index failed:", err);
			}
		})();

		// Fire-and-forget session indexing in background. Do not block the hook.
		(async () => {
			try {
				// project id required by indexSessions; pass from ctx.project.id
				await indexSessions(ctx.directory, ctx.directory, {
					projectId: ctx.project?.id,
				});
			} catch (err) {
				// Log errors but do not throw to avoid blocking hook execution
				console.error("session indexing failed:", err);
			}
		})();
	} catch (err) {
		console.error("Failed to initialize memsearch plugin session:", err);
	}
};
