import { tool } from "@opencode-ai/plugin";
import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { MemsearchCLI } from "../cli-wrapper";
import {
	appendEntryToSessionMarkdown,
	initSessionMarkdown,
} from "../hooks/session-to-markdown";
import { isThrottled, markSessionProcessed } from "../state";

const cli = new MemsearchCLI();

interface BackfillQueue {
	pending: string[];
	processing: boolean;
	lastProcessedAt: number;
	batchSize: number;
	processedCount: number;
	totalCount: number;
}

function getQueuePath(workdir: string): string {
	return path.join(workdir, ".memsearch", "backfill-queue.json");
}

function loadQueue(workdir: string): BackfillQueue | null {
	const queuePath = getQueuePath(workdir);
	if (existsSync(queuePath)) {
		try {
			return JSON.parse(readFileSync(queuePath, "utf-8"));
		} catch {
			return null;
		}
	}
	return null;
}

function saveQueue(workdir: string, queue: BackfillQueue) {
	const queuePath = getQueuePath(workdir);
	try {
		writeFileSync(queuePath, JSON.stringify(queue, null, 2));
	} catch (err) {
		console.error("[memsearch] Failed to save backfill queue:", err);
	}
}

function deleteQueue(workdir: string) {
	const queuePath = getQueuePath(workdir);
	try {
		if (existsSync(queuePath)) {
			require("fs").unlinkSync(queuePath);
		}
	} catch {
		// Ignore
	}
}

async function fetchAndPopulateSession(
	sessionId: string,
	ctx: any,
): Promise<boolean> {
	try {
		const result = await ctx.client.session.messages({
			path: { id: sessionId },
		});

		if (!result?.data) {
			return false;
		}

		const messages = result.data;
		initSessionMarkdown(sessionId);

		for (const msg of messages) {
			if (msg.info?.role && msg.parts) {
				const content = msg.parts
					.filter((p: any) => p.type === "text" && p.text)
					.map((p: any) => p.text)
					.join("\n");

				if (content.trim()) {
					appendEntryToSessionMarkdown(sessionId, {
						ts: new Date().toISOString(),
						role: msg.info.role,
						content: content,
						messageID: msg.info.id,
					});
				}
			}
		}

		return true;
	} catch (err) {
		console.error(`[memsearch] Failed to fetch session ${sessionId}:`, err);
		return false;
	}
}

async function processBatch(
	queue: BackfillQueue,
	ctx: any,
	workdir: string,
): Promise<{ processed: number; hasMore: boolean }> {
	const batch = queue.pending.slice(0, queue.batchSize);
	let processed = 0;

	for (const sessionId of batch) {
		if (isThrottled(sessionId)) {
			continue;
		}

		console.log(`[memsearch-backfill] Processing session: ${sessionId}`);
		const success = await fetchAndPopulateSession(sessionId, ctx);

		if (success) {
			markSessionProcessed(sessionId);
			processed++;
		}

		queue.pending = queue.pending.filter((id) => id !== sessionId);
		queue.processedCount++;
	}

	if (processed > 0) {
		await cli.index(workdir, { recursive: true });
	}

	queue.lastProcessedAt = Date.now();
	saveQueue(workdir, queue);

	return {
		processed,
		hasMore: queue.pending.length > 0,
	};
}

async function getUnprocessedSessions(workdir: string): Promise<string[]> {
	const sessionsDir = path.join(workdir, ".memsearch", "sessions");
	const indexedPath = path.join(workdir, ".memsearch", "indexed.json");

	if (!existsSync(sessionsDir)) {
		return [];
	}

	const indexedState = existsSync(indexedPath)
		? JSON.parse(readFileSync(indexedPath, "utf-8"))
		: {};
	const indexedSessions = new Set(Object.keys(indexedState.sessions || {}));

	const fs = await import("fs");
	const sessionFiles = fs
		.readdirSync(sessionsDir)
		.filter((f: string) => f.endsWith(".md"))
		.map((f: string) => f.replace(".md", ""));

	return sessionFiles.filter((id: string) => !indexedSessions.has(id));
}

export const memBackfillTool = tool({
	description: "Process all unindexed historical sessions in batches",
	args: {
		action: tool.schema
			.enum(["start", "status", "pause", "resume", "cancel"])
			.optional()
			.describe(
				"Action to perform: start, check status, pause, resume, or cancel backfill",
			),
		batchSize: tool.schema
			.number()
			.optional()
			.describe("Number of sessions to process per batch (default: 5)"),
		continuous: tool.schema
			.boolean()
			.optional()
			.describe(
				"Use continuous mode (processes all sessions across session idle events)",
			),
	},

	async execute(rawArgs, _context) {
		const args = rawArgs as {
			action?: "start" | "status" | "pause" | "resume" | "cancel";
			batchSize?: number;
			continuous?: boolean;
		};
		const ctx = _context as any;
		const workdir = ctx.directory;
		const action = args.action || "status";

		const checkResult = await $`which memsearch`.quiet().nothrow();
		if (checkResult.exitCode !== 0) {
			return "memsearch CLI not found. Please install it with: pip install memsearch";
		}

		switch (action) {
			case "status": {
				const queue = loadQueue(workdir);
				const unprocessed = await getUnprocessedSessions(workdir);

				if (!queue && unprocessed.length === 0) {
					return "✅ All sessions are indexed. No backfill needed.";
				}

				if (queue) {
					const status = queue.processing ? "🔄 Processing" : "⏸️ Paused";
					const progress = (
						(queue.processedCount / queue.totalCount) *
						100
					).toFixed(1);
					return (
						`${status}: ${queue.processedCount}/${queue.totalCount} sessions (${progress}%)\n` +
						`Pending: ${queue.pending.length} sessions\n` +
						`Last processed: ${new Date(queue.lastProcessedAt).toLocaleString()}`
					);
				} else {
					return (
						`📋 Found ${unprocessed.length} unprocessed sessions\n` +
						`Run 'opencode tool mem-backfill --action start' to begin processing`
					);
				}
			}

			case "start": {
				const existingQueue = loadQueue(workdir);
				if (existingQueue?.processing) {
					return "⚠️ Backfill is already in progress. Use --action status to check progress.";
				}

				const unprocessed = await getUnprocessedSessions(workdir);
				if (unprocessed.length === 0) {
					return "✅ All sessions are already indexed.";
				}

				const queue: BackfillQueue = {
					pending: unprocessed,
					processing: true,
					lastProcessedAt: Date.now(),
					batchSize: args.batchSize || 5,
					processedCount: 0,
					totalCount: unprocessed.length,
				};

				saveQueue(workdir, queue);

				if (args.continuous) {
					return (
						`🚀 Starting continuous backfill of ${unprocessed.length} sessions...\n` +
						`Processing ${queue.batchSize} sessions per batch.\n` +
						`The next batch will be processed when this session goes idle.`
					);
				} else {
					const result = await processBatch(queue, ctx, workdir);

					if (result.hasMore) {
						return (
							`✅ Processed ${result.processed} sessions.\n` +
							`${queue.pending.length} sessions remaining.\n` +
							`Run 'opencode tool mem-backfill' again to continue, ` +
							`or use --continuous to auto-process across session idle events.`
						);
					} else {
						deleteQueue(workdir);
						return `✅ Backfill complete! Processed ${queue.processedCount} sessions.`;
					}
				}
			}

			case "pause": {
				const queue = loadQueue(workdir);
				if (!queue) {
					return "No active backfill to pause.";
				}
				queue.processing = false;
				saveQueue(workdir, queue);
				return `⏸️ Backfill paused. ${queue.pending.length} sessions remaining.`;
			}

			case "resume": {
				const queue = loadQueue(workdir);
				if (!queue) {
					return "No backfill queue found. Use --action start to begin.";
				}
				if (queue.processing) {
					return "Backfill is already running.";
				}

				queue.processing = true;
				saveQueue(workdir, queue);

				const result = await processBatch(queue, ctx, workdir);

				if (!result.hasMore) {
					deleteQueue(workdir);
					return `✅ Backfill complete! Processed ${queue.processedCount} sessions.`;
				}

				return `✅ Processed ${result.processed} sessions. ${queue.pending.length} remaining.`;
			}

			case "cancel": {
				const queue = loadQueue(workdir);
				if (!queue) {
					return "No active backfill to cancel.";
				}
				const remaining = queue.pending.length;
				deleteQueue(workdir);
				return `❌ Backfill cancelled. ${remaining} sessions remain unprocessed.`;
			}

			default:
				return "Unknown action. Use: start, status, pause, resume, or cancel";
		}
	},
});

export default memBackfillTool;
