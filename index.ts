import type { Plugin } from "@opencode-ai/plugin";
import { onSessionCompacting } from "./hooks/session-compacting";
import { onSessionCreated } from "./hooks/session-created";
import { onSessionIdle } from "./hooks/session-idle";
import { onSystemTransform } from "./hooks/system-transform";
import { onToolExecuted } from "./hooks/tool-executed";
import { signalSessionActivity } from "./lib/memory-queue";
import { shouldSkipSession } from "./state";
import memCompactTool from "./tools/compact";
import memExpandTool from "./tools/expand";
import memIndexTool from "./tools/index";
import memSearchTool from "./tools/search";
import memWatchTool from "./tools/watch";
import "./lib/memory-worker";
import { startSessionDaemon } from "./lib/session-daemon";
import { basename } from "path";
import { $ } from "bun";

async function getProjectDisplayName(directory: string): Promise<string> {
	const folderName = basename(directory);
	
	try {
		const result = await $`cd ${directory} && git branch --show-current 2>/dev/null`.quiet();
		const branch = result.text().trim();
		if (branch) {
			return `${folderName}:${branch}`;
		}
	} catch {
		// Not a git repo or no branch
	}
	
	return folderName;
}

const plugin: Plugin = async ({ project, client, $, directory, worktree }) => {
	// Start the session daemon (auto-registers on plugin load)
	startSessionDaemon();
	
	// Queue daemon health check periodically (every ~30s via deduplication)
	const projectName = await getProjectDisplayName(directory || process.cwd());
	return {
		tool: {
			"mem-index": memIndexTool,
			"mem-search": memSearchTool,
			"mem-watch": memWatchTool,
			"mem-compact": memCompactTool,
			"mem-expand": memExpandTool,
			"mem-version": (await import("./tools/version")).default,
			"mem-reset": (await import("./tools/reset")).default,
			"mem-stats": (await import("./tools/stats")).default,
			"mem-config": (await import("./tools/config")).default,
			"mem-transcript": (await import("./tools/transcript")).default,
			"mem-doctor": (await import("./tools/doctor")).default,
		},
		hook: {
			"session.created": onSessionCreated,
			"session.deleted": (await import("./hooks/session-deleted"))
				.onSessionDeleted,
			"session.idle": onSessionIdle,
			"experimental.session.compacting": onSessionCompacting,
			"experimental.chat.system.transform": onSystemTransform,
			"message.updated": (await import("./hooks/message-updated"))
				.onMessageUpdated,
			"message.part.updated": (await import("./hooks/message-updated"))
				.onMessagePartUpdated,
			"tool.execute.after": onToolExecuted,
		},
		event: async ({ event }) => {
			const evType = (event as { type?: string }).type;
			const ev = event as { 
				sessionID?: string; 
				data?: { sessionID?: string };
				properties?: { info?: { id?: string } };
			};
			const sessionID = ev.sessionID || ev.data?.sessionID || ev.properties?.info?.id;
			
			console.log(`[memsearch] Event received: ${evType}, sessionID: ${sessionID}`);
			
			if (evType === "session.created" && sessionID) {
				console.log(`[memsearch] Handling session.created for ${sessionID}`);
				
				if (shouldSkipSession(sessionID)) {
					console.log(`[memsearch] Skipping session: ${sessionID}`);
					return;
				}
				
				try {
					await signalSessionActivity(
						'session-created',
						sessionID,
						projectName,
						directory,
						{ event: 'session.created' }
					);
					console.log(`[memsearch] Queued session.created for ${sessionID}`);
				} catch (err) {
					console.error(`[memsearch] Failed to queue session:`, err);
				}
				
				// Also queue a daemon health check
				try {
					await signalSessionActivity(
						'daemon-health-check',
						'health-check',
						'global',
						directory,
						{ triggeredBy: 'session.created' }
					);
				} catch (err) {
					// Non-critical, don't fail session processing
					console.log('[memsearch] Daemon health check queued');
				}
			}
			
			if (evType === "session.idle" && sessionID) {
				console.log(`[memsearch] Handling session.idle for ${sessionID}`);
				
				try {
					await signalSessionActivity(
						'session-idle',
						sessionID,
						projectName,
						directory,
						{ event: 'session.idle' }
					);
					console.log(`[memsearch] Queued session.idle for ${sessionID}`);
				} catch (err) {
					console.error(`[memsearch] Failed to queue idle:`, err);
				}
				
				// Also queue a daemon health check
				try {
					await signalSessionActivity(
						'daemon-health-check',
						'health-check',
						'global',
						directory,
						{ triggeredBy: 'session.idle' }
					);
				} catch (err) {
					// Non-critical
					console.log('[memsearch] Daemon health check queued');
				}
			}
		},
	};
};

export default plugin;
