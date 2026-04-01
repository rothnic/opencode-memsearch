import type { Plugin } from "@opencode-ai/plugin";
import { onSessionCompacting } from "./hooks/session-compacting";
import { onSessionCreated } from "./hooks/session-created";
import { onSessionIdle } from "./hooks/session-idle";
import { onSystemTransform } from "./hooks/system-transform";
import { onToolExecuted } from "./hooks/tool-executed";
import loadConfig from "./config";
import { startBackfillInBackground } from "./lib/queue/backfill";
import { setupRecurringJobs, signalSessionActivity } from "./lib/queue/memory-queue";
import "./lib/queue/memory-worker";
import { $ } from "bun";
import { basename } from "path";

async function getProjectDisplayName(directory: string): Promise<string> {
	const folderName = basename(directory);

	try {
		const result =
			await $`cd ${directory} && git branch --show-current 2>/dev/null`.quiet();
		const branch = result.text().trim();
		if (branch) {
			return `${folderName}:${branch}`;
		}
	} catch {
		// Not a git repo or no branch
	}

	return folderName;
}

let initialized = false;
let globalConfig: import("./types").MemsearchConfig | null = null;

// Track which projects have had their initial backfill run
const backfillInitializedProjects = new Set<string>();

const plugin: Plugin = async ({ project, client, $, directory, worktree }) => {
	// Load config on first plugin load
	if (!globalConfig) {
		try {
			globalConfig = await loadConfig(directory || process.cwd());
		} catch {
			// If config fails to load, use defaults (feature flags will be undefined = defaults)
			globalConfig = null;
		}
	}

	const featureFlags = globalConfig?.featureFlags;
	const projectId = project?.id || directory || process.cwd();

	// One-time initialization on first plugin load
	if (!initialized) {
		initialized = true;

		// Set up recurring jobs if enabled (default: true)
		if (featureFlags?.enableRecurringJobs !== false) {
			setupRecurringJobs().catch(() => {
				// Silent fail
			});
		}
	}

	const projectName = await getProjectDisplayName(directory || process.cwd());

	// Build hooks object conditionally based on feature flags
	const hooks: Record<string, any> = {
		"session.created": onSessionCreated,
		"session.deleted": (await import("./hooks/session-deleted"))
			.onSessionDeleted,
		"experimental.session.compacting": onSessionCompacting,
		"tool.execute.after": onToolExecuted,
	};

	// Only register session.idle if explicitly enabled (default: false)
	// This hook can be expensive due to LLM summarization
	if (featureFlags?.enableSessionIdleSummarization === true) {
		hooks["session.idle"] = onSessionIdle;
	}

	// Only register system transform if enabled (default: true)
	if (featureFlags?.enableSystemTransform !== false) {
		hooks["experimental.chat.system.transform"] = onSystemTransform;
	}

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
		hook: hooks,
		event: async ({ event }) => {
			const evType = (event as { type?: string }).type;
			const ev = event as {
				sessionID?: string;
				data?: { sessionID?: string };
				properties?: { info?: { id?: string } };
			};
			const sessionID =
				ev.sessionID || ev.data?.sessionID || ev.properties?.info?.id;

			if (evType === "session.created" && sessionID) {
				if (shouldSkipSession(sessionID)) {
					return;
				}

				// Run backfill on first session for this project (if enabled)
				if (featureFlags?.enableBackfill !== false && !backfillInitializedProjects.has(projectId)) {
					backfillInitializedProjects.add(projectId);
					// Run backfill in background (non-blocking)
					startBackfillInBackground();
				}

				try {
					await signalSessionActivity(
						"session-created",
						sessionID,
						projectName,
						directory,
						{ event: "session.created", priority: 10 },
					);
				} catch {
					// Silent fail
				}
			}

			// Only handle session.idle if the feature is enabled
			if (evType === "session.idle" && sessionID && featureFlags?.enableSessionIdleSummarization === true) {
				try {
					await signalSessionActivity(
						"session-idle",
						sessionID,
						projectName,
						directory,
						{ event: "session.idle", priority: 15 },
					);
				} catch {
					// Silent fail
				}
			}
		},
	};
};

export default plugin;
