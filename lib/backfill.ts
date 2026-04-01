import Database from "bun:sqlite";
import { $ } from "bun";
import { join } from "path";
import { generateSessionMarkdown } from "./session-generator";

interface SessionInfo {
	id: string;
	project_id: string;
	directory: string;
	title?: string;
	time_updated: number;
	message_count: number;
}

// Track ongoing markdown generation batches
let markdownGenerationInProgress = false;

// Conservative batching settings to avoid overwhelming the system
const BATCH_SIZE = 10;           // Process 10 sessions at a time (was 50)
const BATCH_DELAY_MS = 2000;     // 2 second pause between batches (was 500ms)
const MAX_SESSIONS_PER_BACKFILL = 100; // Limit to 100 most recent sessions
const BACKFILL_COOLDOWN_MS = 30 * 60 * 1000; // 30 minute cooldown between backfills

let lastBackfillTime = 0;

function getDatabasePath(): string {
	return join(
		process.env.HOME || "",
		".local",
		"share",
		"opencode",
		"opencode.db",
	);
}

async function queryAllSessions(): Promise<SessionInfo[]> {
	const dbPath = getDatabasePath();
	const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days

	try {
		const db = new Database(dbPath, { readonly: true });

		const rows = db
			.query(
				`SELECT 
					s.id,
					s.project_id,
					s.directory,
					s.title,
					s.time_updated,
					COUNT(m.id) as message_count
				 FROM session s
				 LEFT JOIN message m ON m.session_id = s.id
				 WHERE s.time_updated > ?
				 GROUP BY s.id
				 ORDER BY s.time_updated DESC`,
			)
			.all(cutoffTime) as any[];

		db.close();

		return rows.map((row) => ({
			id: row.id,
			project_id: row.project_id,
			directory: row.directory,
			title: row.title,
			time_updated: row.time_updated,
			message_count: row.message_count,
		}));
	} catch {
		return [];
	}
}

function calculatePriority(session: SessionInfo): number {
	const now = Date.now();
	const ageMs = now - session.time_updated;
	const hoursOld = ageMs / (1000 * 60 * 60);

	if (hoursOld < 1) {
		return 200; // Very recent - highest priority
	} else if (hoursOld < 24) {
		return 100; // Today
	} else if (hoursOld < 24 * 7) {
		return 50; // This week
	} else {
		return 10; // Older
	}
}

async function generateMarkdownForSession(session: SessionInfo): Promise<boolean> {
	try {
		await generateSessionMarkdown(session.id, session.directory);
		return true;
	} catch {
		return false;
	}
}

export async function backfillAllSessions(): Promise<{
	queued: number;
	processed: number;
	total: number;
	skipped?: boolean;
}> {
	// Check cooldown period
	const now = Date.now();
	const timeSinceLastBackfill = now - lastBackfillTime;
	if (timeSinceLastBackfill < BACKFILL_COOLDOWN_MS) {
		const minutesRemaining = Math.ceil((BACKFILL_COOLDOWN_MS - timeSinceLastBackfill) / 60000);
		console.log(`[memsearch] Backfill skipped: ${minutesRemaining} minutes remaining in cooldown`);
		return { queued: 0, processed: 0, total: 0, skipped: true };
	}

	// Prevent multiple concurrent backfill batches
	if (markdownGenerationInProgress) {
		return { queued: 0, processed: 0, total: 0 };
	}

	markdownGenerationInProgress = true;
	lastBackfillTime = now;

	try {
		let sessions = await queryAllSessions();

		if (sessions.length === 0) {
			return { queued: 0, processed: 0, total: 0 };
		}

		// Limit to most recent sessions
		if (sessions.length > MAX_SESSIONS_PER_BACKFILL) {
			sessions = sessions.slice(0, MAX_SESSIONS_PER_BACKFILL);
		}

		let processed = 0;

		// Process in conservative batches
		for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
			const batch = sessions.slice(i, i + BATCH_SIZE);

			// Generate markdown for all sessions in batch concurrently
			const results = await Promise.all(
				batch.map((session) => generateMarkdownForSession(session)),
			);

			processed += results.filter(Boolean).length;

			// Delay between batches to avoid overwhelming SQLite
			if (i + BATCH_SIZE < sessions.length) {
				await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
			}
		}

		console.log(`[memsearch] Backfill complete: ${processed}/${sessions.length} sessions processed`);
		return { queued: 0, processed, total: sessions.length };
	} finally {
		markdownGenerationInProgress = false;
	}
}

export function startBackfillInBackground(): void {
	// Don't await - truly non-blocking
	setTimeout(() => {
		backfillAllSessions().catch(() => {
			// Silent fail
		});
	}, 100);
}

export async function checkForUnprocessedSessions(): Promise<void> {
	await backfillAllSessions();
}
