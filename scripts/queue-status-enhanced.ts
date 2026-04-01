#!/usr/bin/env bun
/**
 * Enhanced Global Queue Status CLI for memsearch bunqueue
 * Shows job types, queue settings, and work summaries
 *
 * Usage: bun queue-status-enhanced.ts [options]
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";

const queueDbPath = join(
	homedir(),
	".config",
	"opencode",
	"memsearch",
	"queue",
	"memory.db",
);

interface Job {
	id: string;
	queue: string;
	state: string;
	priority: number;
	created_at: number;
	run_at: number;
	started_at?: number;
	completed_at?: number;
	attempts: number;
	max_attempts: number;
	unique_key?: string;
	custom_id?: string;
	progress?: number;
	progress_msg?: string;
	data?: string;
}

interface JobResult {
	job_id: string;
	result: string;
	completed_at: number;
}

interface QueueState {
	name: string;
	paused: number;
	rate_limit?: number;
	concurrency_limit?: number;
}

interface CronJob {
	name: string;
	queue: string;
	schedule?: string;
	repeat_every?: number;
	priority: number;
	next_run: number;
	executions: number;
}

function formatDate(timestamp: number): string {
	if (!timestamp) return "N/A";
	return new Date(timestamp).toLocaleString();
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60000).toFixed(1)}m`;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function parseJobData(dataBlob: string): any {
	try {
		return JSON.parse(dataBlob);
	} catch {
		return {};
	}
}

function parseJobResult(resultBlob: string): any {
	try {
		return JSON.parse(resultBlob);
	} catch {
		return {};
	}
}

function getJobTypeIcon(type: string): string {
	const icons: Record<string, string> = {
		"session-created": "🆕",
		"session-idle": "⏸️",
		"session-deleted": "🗑️",
		"manual-index": "📁",
		"backfill": "🔄",
	};
	return icons[type] || "📋";
}

function getJobTypeLabel(type: string): string {
	const labels: Record<string, string> = {
		"session-created": "Session Created",
		"session-idle": "Session Idle",
		"session-deleted": "Session Deleted",
		"manual-index": "Manual Index",
		"backfill": "Backfill",
	};
	return labels[type] || type;
}

function getQueueSettings(db: Database): QueueState[] {
	return db.query(`
    SELECT name, paused, rate_limit, concurrency_limit
    FROM queue_state
  `).all() as QueueState[];
}

function getCronJobs(db: Database): CronJob[] {
	return db.query(`
    SELECT name, queue, schedule, repeat_every, priority, next_run, executions
    FROM cron_jobs
    ORDER BY next_run ASC
  `).all() as CronJob[];
}

function getJobStatsByType(db: Database): { type: string; count: number }[] {
	const jobs = db.query(`
    SELECT data FROM jobs WHERE state = 'completed'
  `).all() as { data: string }[];

	const typeCounts: Record<string, number> = {};
	for (const job of jobs) {
		const data = parseJobData(job.data);
		const type = data.type || "unknown";
		typeCounts[type] = (typeCounts[type] || 0) + 1;
	}

	return Object.entries(typeCounts)
		.map(([type, count]) => ({ type, count }))
		.sort((a, b) => b.count - a.count);
}

function getJobsWithResults(
	db: Database,
	limit: number,
	stateFilter?: string,
	projectFilter?: string,
): { job: Job; result?: any }[] {
	let query = `
    SELECT 
      j.id, j.queue, j.state, j.priority, j.created_at, j.run_at, 
      j.started_at, j.completed_at, j.attempts, j.max_attempts,
      j.unique_key, j.custom_id, j.progress, j.progress_msg, j.data,
      jr.result as result_data
    FROM jobs j
    LEFT JOIN job_results jr ON j.id = jr.job_id
  `;

	const conditions: string[] = [];

	if (stateFilter) {
		conditions.push(`j.state = '${stateFilter}'`);
	}

	if (projectFilter) {
		conditions.push(`j.unique_key LIKE '${projectFilter}:%'`);
	}

	if (conditions.length > 0) {
		query += ` WHERE ${conditions.join(" AND ")}`;
	}

	query += ` ORDER BY j.completed_at DESC, j.created_at DESC LIMIT ${limit}`;

	const rows = db.query(query).all() as any[];
	return rows.map((row) => ({
		job: {
			id: row.id,
			queue: row.queue,
			state: row.state,
			priority: row.priority,
			created_at: row.created_at,
			run_at: row.run_at,
			started_at: row.started_at,
			completed_at: row.completed_at,
			attempts: row.attempts,
			max_attempts: row.max_attempts,
			unique_key: row.unique_key,
			custom_id: row.custom_id,
			progress: row.progress,
			progress_msg: row.progress_msg,
			data: row.data,
		},
		result: row.result_data ? parseJobResult(row.result_data) : undefined,
	}));
}

function displayEnhancedStatus(
	db: Database,
	limit: number,
	stateFilter?: string,
	projectFilter?: string,
) {
	console.clear();
	console.log("╔══════════════════════════════════════════════════════════════════════════╗");
	console.log("║     🔄 Enhanced Queue Status - Memsearch Bunqueue                       ║");
	console.log("╚══════════════════════════════════════════════════════════════════════════╝");
	console.log();

	// Queue Settings
	const queueSettings = getQueueSettings(db);
	if (queueSettings.length > 0) {
		console.log("⚙️  Queue Settings:");
		console.log("─".repeat(80));
		for (const qs of queueSettings) {
			const status = qs.paused ? "⏸️ Paused" : "▶️ Running";
			const rateLimit = qs.rate_limit ? `${qs.rate_limit}/sec` : "unlimited";
			const concurrency = qs.concurrency_limit || "default";
			console.log(`   ${status} | Rate: ${rateLimit} | Concurrency: ${concurrency}`);
		}
		console.log();
	}

	// Cron Jobs (Recurring Jobs)
	const cronJobs = getCronJobs(db);
	if (cronJobs.length > 0) {
		console.log("📅 Recurring Jobs:");
		console.log("─".repeat(80));
		for (const cj of cronJobs) {
			const schedule = cj.schedule || (cj.repeat_every ? `every ${formatDuration(cj.repeat_every)}` : "unknown");
			const nextRun = formatDate(cj.next_run);
			console.log(`   ${cj.name.padEnd(20)} ${schedule.padEnd(20)} Next: ${nextRun} (${cj.executions} runs)`);
		}
		console.log();
	}

	// Job Stats by Type
	const typeStats = getJobStatsByType(db);
	if (typeStats.length > 0) {
		console.log("📊 Completed Jobs by Type:");
		console.log("─".repeat(80));
		for (const stat of typeStats.slice(0, 6)) {
			const icon = getJobTypeIcon(stat.type);
			const label = getJobTypeLabel(stat.type);
			console.log(`   ${icon} ${label.padEnd(20)} ${stat.count.toString().padStart(4)} jobs`);
		}
		console.log();
	}

	// Recent Jobs with Details
	const jobsWithResults = getJobsWithResults(db, limit, stateFilter, projectFilter);
	if (jobsWithResults.length > 0) {
		const title = stateFilter
			? `📋 Recent ${stateFilter.charAt(0).toUpperCase() + stateFilter.slice(1)} Jobs`
			: "📋 Recent Jobs with Results";
		console.log(`${title} (last ${limit}):`);
		console.log("─".repeat(80));

		for (const { job, result } of jobsWithResults) {
			const data = parseJobData(job.data || "{}");
			const jobType = data.type || "unknown";
			const projectId = job.unique_key?.split(":")[0] || "unknown";
			const icon = getJobTypeIcon(jobType);
			const typeLabel = getJobTypeLabel(jobType);

			// Header line
			console.log(`${icon} ${typeLabel.padEnd(18)} | ${projectId.padEnd(20)} | ${job.state.toUpperCase()}`);

			// Timing info
			const created = formatDate(job.created_at);
			let duration = "";
			if (job.completed_at && job.started_at) {
				duration = formatDuration(job.completed_at - job.started_at);
			} else if (job.started_at) {
				duration = `${formatDuration(Date.now() - job.started_at)} (running)`;
			}
			console.log(`   Created: ${created.padEnd(25)} Duration: ${duration}`);

			// Result summary for completed jobs
			if (result && job.state === "completed") {
				if (result.indexed) {
					console.log(`   ✅ Indexed: ${result.manual ? "manual" : "auto"}`);
				}
				if (result.compacted) {
					const summary = result.summary ? result.summary.substring(0, 60) + "..." : "yes";
					console.log(`   📝 Compacted: ${summary}`);
				}
				if (result.backfillComplete) {
					console.log(`   🔄 Backfill completed`);
				}
				if (result.discovered) {
					console.log(`   🔍 Discovered ${result.projectsQueued} projects`);
				}
				if (result.deferred) {
					console.log(`   ⏸️ Deferred: ${result.reason}`);
				}
			}

			// Error info for failed jobs
			if (result?.error && job.state === "failed") {
				console.log(`   ❌ Error: ${result.error.substring(0, 70)}`);
			}

			console.log();
		}
	}

	// Database info
	const stats = db.query(`SELECT state, COUNT(*) as count FROM jobs GROUP BY state`).all() as any[];
	const totalJobs = stats.reduce((sum, row) => sum + row.count, 0);
	console.log("💾 Database:");
	console.log(`   Path: ${queueDbPath}`);
	console.log(`   Total Jobs: ${totalJobs} (${stats.map(s => `${s.state}: ${s.count}`).join(", ")})`);
	console.log(`   Updated: ${new Date().toLocaleString()}`);
}

function showHelp() {
	console.log(`
Enhanced Queue Status - Memsearch Bunqueue

Usage:
  bun queue-status-enhanced.ts [options]

Options:
  --watch, -w       Watch mode (refresh every 2 seconds)
  --limit, -l N     Show N jobs (default: 10)
  --state, -s S     Filter by state (waiting, active, completed, failed)
  --project, -p P   Filter by project ID
  --help, -h        Show this help

Features:
  - Shows queue settings (concurrency, rate limits)
  - Shows recurring/cron jobs
  - Shows job type breakdown
  - Shows work results (indexed files, compaction summaries, etc.)

Examples:
  bun queue-status-enhanced.ts                    # Show enhanced summary
  bun queue-status-enhanced.ts -w                 # Watch mode
  bun queue-status-enhanced.ts -s completed       # Show completed jobs
  bun queue-status-enhanced.ts -l 20              # Show 20 most recent
`);
}

async function watchMode(
	limit: number,
	stateFilter?: string,
	projectFilter?: string,
) {
	const db = new Database(queueDbPath, { readonly: true });

	console.log("👀 Watch mode enabled (Ctrl+C to exit)...");

	const run = () => {
		try {
			displayEnhancedStatus(db, limit, stateFilter, projectFilter);
		} catch (err) {
			console.error("Error reading database:", err);
		}
	};

	run();
	setInterval(run, 2000);
}

function main() {
	const args = process.argv.slice(2);

	// Parse arguments
	let watch = false;
	let limit = 10;
	let stateFilter: string | undefined;
	let projectFilter: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			showHelp();
			process.exit(0);
		} else if (arg === "--watch" || arg === "-w") {
			watch = true;
		} else if ((arg === "--limit" || arg === "-l") && args[i + 1]) {
			limit = parseInt(args[++i], 10);
		} else if ((arg === "--state" || arg === "-s") && args[i + 1]) {
			stateFilter = args[++i];
		} else if ((arg === "--project" || arg === "-p") && args[i + 1]) {
			projectFilter = args[i + 1];
		}
	}

	// Check if database exists
	try {
		const db = new Database(queueDbPath, { readonly: true });

		if (watch) {
			watchMode(limit, stateFilter, projectFilter);
		} else {
			displayEnhancedStatus(db, limit, stateFilter, projectFilter);
			db.close();
		}
	} catch (err) {
		console.error("❌ Error accessing queue database:");
		console.error(`   Path: ${queueDbPath}`);
		console.error(`   Error: ${err}`);
		console.error();
		console.error("The queue database may not exist yet.");
		console.error("Start OpenCode with the memsearch plugin to initialize it.");
		process.exit(1);
	}
}

main();
