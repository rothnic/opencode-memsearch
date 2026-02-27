import Database from "bun:sqlite";
import { $ } from "bun";
import { join } from "path";
import { signalSessionActivity } from "./memory-queue";

interface SessionInfo {
	id: string;
	project_id: string;
	directory: string;
	title?: string;
	time_updated: number;
	message_count: number;
}

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
				 GROUP BY s.id
				 ORDER BY s.time_updated DESC`,
			)
			.all() as any[];

		db.close();

		return rows.map((row) => ({
			id: row.id,
			project_id: row.project_id,
			directory: row.directory,
			title: row.title,
			time_updated: row.time_updated,
			message_count: row.message_count,
		}));
	} catch (err) {
		console.error("[backfill] Failed to query sessions:", err);
		return [];
	}
}

function calculatePriority(session: SessionInfo): number {
	const now = Date.now();
	const ageMs = now - session.time_updated;
	const hoursOld = ageMs / (1000 * 60 * 60);

	if (hoursOld < 24) {
		return 100;
	} else if (hoursOld < 24 * 7) {
		return 50;
	} else {
		return 10;
	}
}

async function queueSession(session: SessionInfo): Promise<void> {
	try {
		let projectName = session.project_id;
		try {
			const folderName =
				session.directory.split("/").pop() || session.project_id;
			const result =
				await $`cd ${session.directory} && git branch --show-current 2>/dev/null`.quiet();
			const branch = result.text().trim();
			if (branch) {
				projectName = `${folderName}:${branch}`;
			} else {
				projectName = folderName;
			}
		} catch {
			projectName = session.directory.split("/").pop() || session.project_id;
		}

		const priority = calculatePriority(session);

		// First queue fast markdown generation
		await signalSessionActivity(
			"generate-markdown",
			session.id,
			projectName,
			session.directory,
			{
				priority,
				messageCount: session.message_count,
				isBackfill: true,
				timeUpdated: session.time_updated,
			},
		);
	} catch (err) {
		if ((err as Error).message?.includes("UNIQUE constraint")) {
			return;
		}
		console.error(`[backfill] Failed to queue session ${session.id}:`, err);
	}
}

export async function backfillAllSessions(): Promise<{
	queued: number;
	total: number;
}> {
	const sessions = await queryAllSessions();

	if (sessions.length === 0) {
		return { queued: 0, total: 0 };
	}

	// Queue all sessions - bunqueue will handle rate limiting
	let queued = 0;
	for (const session of sessions) {
		await queueSession(session);
		queued++;

		if (queued % 100 === 0) {
			console.log(`[backfill] Queued ${queued}/${sessions.length} sessions...`);
		}
	}

	console.log(`[backfill] Complete: ${queued} sessions queued`);
	return { queued, total: sessions.length };
}

export function startBackfillInBackground(): void {
	setTimeout(async () => {
		try {
			const result = await backfillAllSessions();
			if (result.queued > 0) {
				console.log(
					`[backfill] Queued ${result.queued} sessions in background`,
				);
			}
		} catch (err) {
			console.error("[backfill] Background backfill failed:", err);
		}
	}, 100);
}

export async function checkForUnprocessedSessions(): Promise<void> {
	const result = await backfillAllSessions();

	if (result.queued > 0) {
		console.log(`[backfill] Found ${result.queued} unprocessed sessions`);
	}
}
