import type { Plugin } from "@opencode-ai/plugin";
import { onSessionCompacting } from "./hooks/session-compacting";
import { onSessionCreated } from "./hooks/session-created";
import { onSessionIdle } from "./hooks/session-idle";
import { onSystemTransform } from "./hooks/system-transform";
import { onToolExecuted } from "./hooks/tool-executed";
import { signalSessionActivity } from "./lib/memory-queue";
import { shouldSkipSession, type SessionInfo } from "./state";
import memCompactTool from "./tools/compact";
import memExpandTool from "./tools/expand";
import memIndexTool from "./tools/index";
import memSearchTool from "./tools/search";
import memWatchTool from "./tools/watch";
// Import to initialize queue and worker
import "./lib/memory-worker";

const plugin: Plugin = async ({ project, client, $, directory, worktree }) => {
	return {
		// Register tools so the OpenCode host can discover them.
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
		// Also handle events like Discord plugin does
		event: async ({ event }) => {
			const evType = (event as { type?: string }).type;
			const sessionID = (event as { sessionID?: string })?.sessionID || 
			                  (event as { data?: { sessionID?: string } })?.data?.sessionID;
			
			console.log(`[memsearch] Event received: ${evType}, sessionID: ${sessionID}`);
			
			if (evType === "session.start" && sessionID) {
				console.log(`[memsearch] Handling session.start for ${sessionID}`);
				
				// Check if we should skip this session
				if (shouldSkipSession(sessionID)) {
					console.log(`[memsearch] Skipping session: ${sessionID}`);
					return;
				}
				
				// Queue the session for processing
				try {
					await signalSessionActivity(
						'session-created',
						sessionID,
						project?.id || directory,
						directory,
						{ event: 'session.start' }
					);
					console.log(`[memsearch] Queued session.start for ${sessionID}`);
				} catch (err) {
					console.error(`[memsearch] Failed to queue session:`, err);
				}
			}
			
			if (evType === "session.idle" && sessionID) {
				console.log(`[memsearch] Handling session.idle for ${sessionID}`);
				
				try {
					await signalSessionActivity(
						'session-idle',
						sessionID,
						project?.id || directory,
						directory,
						{ event: 'session.idle' }
					);
					console.log(`[memsearch] Queued session.idle for ${sessionID}`);
				} catch (err) {
					console.error(`[memsearch] Failed to queue idle:`, err);
				}
			}
		},
	};
};

export default plugin;
