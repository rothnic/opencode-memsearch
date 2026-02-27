import { Database } from "bun:sqlite";
import { mkdir, readdir } from "node:fs/promises";
import { $ } from "bun";
import os from "os";
import path from "path";

/**
 * Session metadata as stored in OpenCode session JSON files.
 */
export interface SessionMetadata {
	id: string;
	title: string;
	directory: string;
	projectID: string;
	time: {
		created: number;
		updated: number;
	};
	summary?: {
		additions: number;
		deletions: number;
		files: number;
	};
}

/**
 * Entry in a session's history recorded as JSONL.
 */
export interface SessionHistoryEntry {
	ts: string;
	role?: string;
	content?: string;
	tool?: string;
	args?: any;
	messageID?: string;
}

/**
 * Check if a session history entry is a system/noise message that should be filtered out.
 * System messages include ultrawork mode notifications, system transforms, and other
 * non-conversational content that shouldn't become memories.
 */
export function isSystemMessage(entry: SessionHistoryEntry): boolean {
	if (!entry) return false;

	// Filter by role
	const role = (entry.role ?? "").toString().toLowerCase();
	if (role === "system") return true;

	// Filter by content patterns
	if (entry.content && typeof entry.content === "string") {
		const content = entry.content.trim();

		// Bracketed system markers like [SYSTEM], [ULTRAWORK MODE], etc.
		if (/^\[(SYSTEM|ULTRAWORK|SYSTEM,|SYSTEM:|\w+\s+MODE)\b/i.test(content))
			return true;

		// memsearch/system transform injection tags
		if (content.includes("<memsearch-context>")) return true;

		// All-caps bracketed tags like [SYSTEM REMINDER], [IMPORTANT], etc.
		if (/^\[[A-Z\- ]{2,}\]$/.test(content)) return true;

		// Oh My OpenCode specific patterns
		if (/^\[dotenv@/.test(content)) return true;
		if (/^\[SYSTEM REMINDER\]/i.test(content)) return true;
		if (/^\[backgroun/i.test(content)) return true;

		// Very short system-like messages (under 20 chars with brackets)
		if (content.length < 20 && /^\[.*\]$/.test(content)) return true;
	}

	return false;
}

/**
 * Combined object for processing a session.
 */
export interface SessionWithHistory {
	metadata: SessionMetadata;
	history: SessionHistoryEntry[];
}

/**
 * Recording for an indexed session in the state file.
 */
export interface IndexedSession {
	indexedAt: number;
	source: "file" | "sdk";
}

/**
 * Structure of the indexed.json state file.
 */
export interface IndexedState {
	sessions: Record<string, IndexedSession>;
	lastRun: number;
}

/**
 * Returns the directory where OpenCode stores session JSON files for a specific project.
 */
export function getSessionsDir(projectId: string): string {
	return path.join(
		os.homedir(),
		".local",
		"share",
		"opencode",
		"storage",
		"session",
		projectId,
	);
}

/**
 * Returns the path to the OpenCode SQLite database.
 */
export function getDatabasePath(): string {
	return path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");
}

/**
 * Load session metadata from SQLite database.
 */
export function loadSessionMetadataFromDB(
	sessionId: string,
	db: Database,
): SessionMetadata | null {
	const row = db
		.query(
			`SELECT id, title, directory, project_id, time_created, time_updated, 
            summary_additions, summary_deletions, summary_files 
     FROM session WHERE id = ?`,
		)
		.get(sessionId) as any;

	if (!row) return null;

	return {
		id: row.id,
		title: row.title,
		directory: row.directory,
		projectID: row.project_id,
		time: {
			created: row.time_created,
			updated: row.time_updated,
		},
		summary:
			row.summary_additions !== null
				? {
						additions: row.summary_additions,
						deletions: row.summary_deletions,
						files: row.summary_files,
					}
				: undefined,
	};
}

/**
 * Get all session IDs for a project from the database.
 */
export function getAllSessionIdsFromDB(
	projectId: string,
	db: Database,
): string[] {
	const rows = db
		.query("SELECT id FROM session WHERE project_id = ?")
		.all(projectId) as any[];
	return rows.map((r) => r.id);
}

/**
 * Load all messages for a session from the database.
 */
export function loadMessagesFromDB(
	sessionId: string,
	db: Database,
): SessionHistoryEntry[] {
	const rows = db
		.query(
			"SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC",
		)
		.all(sessionId) as any[];

	return rows.map((row) => {
		try {
			const data = JSON.parse(row.data);

			// Extract content from various possible locations
			let content = data.content || data.summary?.body;

			// If no direct content, try to extract from diffs
			if (
				!content &&
				data.summary?.diffs &&
				Array.isArray(data.summary.diffs)
			) {
				const diffs = data.summary.diffs;
				if (diffs.length > 0) {
					// Use the after content from the first diff, or combine all
					content = diffs
						.map((d: any) => d.after || d.before || "")
						.join("\n\n");
					content = diffs
						.map((d: any) => d.after || d.before || "")
						.join("\n\n");
					content = diffs
						.map((d: any) => d.after || d.before || "")
						.join("\n\n");
				}
			}

			return {
				ts: new Date(row.time_created).toISOString(),
				role: data.role,
				content: content || "[no content]",
				messageID: row.id,
			};
		} catch (e) {
			return {
				ts: new Date(row.time_created).toISOString(),
				role: "unknown",
				content: "[malformed message]",
				messageID: row.id,
			};
		}
	});
}

/**
 * Loads the indexing state for the project.
 */
export async function loadIndexedState(workdir: string): Promise<IndexedState> {
	const stateFile = path.join(workdir, ".memsearch", "indexed.json");
	const file = Bun.file(stateFile);
	if (await file.exists()) {
		try {
			return await file.json();
		} catch (e) {
			console.warn(
				`memsearch: failed to parse indexed.json, starting fresh: ${e}`,
			);
		}
	}
	return { sessions: {}, lastRun: 0 };
}

/**
 * Saves the indexing state for the project.
 */
export async function saveIndexedState(
	workdir: string,
	state: IndexedState,
): Promise<void> {
	const stateDir = path.join(workdir, ".memsearch");
	await mkdir(stateDir, { recursive: true });
	const stateFile = path.join(stateDir, "indexed.json");
	await Bun.write(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Converts a session and its history to a Markdown document for indexing.
 */
export function convertSessionToMarkdown(session: SessionWithHistory): string {
	const { metadata, history } = session;
	let md = `# ${metadata.title || "Untitled Session"}\n\n`;

	md += `**ID**: ${metadata.id}\n`;
	md += `**Project ID**: ${metadata.projectID}\n`;
	md += `**Created**: ${new Date(metadata.time.created).toLocaleString()}\n`;
	if (metadata.summary) {
		md += `**Stats**: ${metadata.summary.files} files changed, +${metadata.summary.additions} -${metadata.summary.deletions}\n`;
	}
	md += `\n---\n\n`;

	for (const entry of history) {
		// Skip system/noise messages
		if (isSystemMessage(entry)) continue;
		if (entry.role) {
			const timestamp = new Date(entry.ts).toLocaleTimeString();
			md += `## ${entry.role.toUpperCase()} (${timestamp})\n\n`;
			md += `${entry.content}\n\n`;
		} else if (entry.tool) {
			md += `### TOOL: ${entry.tool}\n\n`;
			if (entry.args) {
				md += "```json\n" + JSON.stringify(entry.args, null, 2) + "\n```\n\n";
			}
		}
	}

	return md;
}

/**
 * Main function to index project sessions.
 *
 * @param projectPath Path to the project root.
 * @param workdir Working directory (usually the same as projectPath).
 * @param options Indexing options, including the projectId if known.
 */
export async function indexSessions(
	projectPath: string,
	workdir: string,
	options: { projectId?: string } = {},
): Promise<void> {
	const state = await loadIndexedState(workdir);

	const projectId = options.projectId;
	if (!projectId) {
		// If projectId is not provided, we can't reliably find the sessions directory.
		// In practice, this should be passed from the hook or config.
		return;
	}

	const sessionsDir = getSessionsDir(projectId);
	const historyDir = path.join(workdir, ".memsearch", "history");
	const outputDir = path.join(workdir, ".memsearch", "sessions");

	// Ensure sessions output directory exists
	await mkdir(outputDir, { recursive: true });

	let sessionFiles: string[] = [];
	try {
		sessionFiles = await readdir(sessionsDir);
	} catch (e) {
		// Sessions directory might not exist yet if no sessions have been created.
		return;
	}

	let updatedCount = 0;

	for (const file of sessionFiles) {
		if (!file.endsWith(".json") || !file.startsWith("ses_")) continue;

		const sessionId = file.replace(".json", "");
		const sessionPath = path.join(sessionsDir, file);
		const sessionFile = Bun.file(sessionPath);

		if (!(await sessionFile.exists())) continue;

		let metadata: SessionMetadata;
		try {
			metadata = await sessionFile.json();
		} catch (e) {
			continue;
		}

		const lastUpdated = metadata.time.updated;
		const indexed = state.sessions[sessionId];

		if (indexed && indexed.indexedAt >= lastUpdated) {
			// Session already indexed and not updated since then
			continue;
		}

		// Load history from .memsearch/history
		const historyPath = path.join(historyDir, `${sessionId}.jsonl`);
		const historyFile = Bun.file(historyPath);
		const history: SessionHistoryEntry[] = [];

		if (await historyFile.exists()) {
			const text = await historyFile.text();
			const lines = text.split("\n").filter(Boolean);
			for (const line of lines) {
				try {
					history.push(JSON.parse(line));
				} catch (e) {
					// Skip malformed entries
				}
			}
		}

		// Convert and write markdown
		const md = convertSessionToMarkdown({ metadata, history });
		const outputPath = path.join(outputDir, `${sessionId}.md`);
		await Bun.write(outputPath, md);

		// Update state
		state.sessions[sessionId] = {
			indexedAt: Date.now(),
			source: "file",
		};
		updatedCount++;
	}

	if (updatedCount > 0) {
		state.lastRun = Date.now();
		await saveIndexedState(workdir, state);

		// Trigger memsearch CLI to index the sessions directory
		try {
			const { MemsearchCLI } = await import("../cli-wrapper");
			const cli = new MemsearchCLI($);
			// memsearch index doesn't support --recursive in v0.1.8; call without it.
			await cli.index(outputDir, { collection: "sessions" });
		} catch (e) {
			console.error(`memsearch: session indexing failed to trigger CLI: ${e}`);
		}
	}
}

/**
 * Index all sessions for a project using the SQLite database as the source of truth.
 * This will process ALL sessions for the project, not just those with JSON metadata files.
 */
export async function indexSessionsFromDB(
	projectPath: string,
	workdir: string,
	options: { projectId?: string } = {},
): Promise<void> {
	const state = await loadIndexedState(workdir);
	const projectId = options.projectId;

	if (!projectId) {
		console.warn("memsearch: projectId required for database indexing");
		return;
	}

	const dbPath = getDatabasePath();
	const db = new Database(dbPath);

	try {
		const sessionIds = getAllSessionIdsFromDB(projectId, db);
		console.log(
			`memsearch: found ${sessionIds.length} sessions in database for project ${projectId}`,
		);

		const historyDir = path.join(workdir, ".memsearch", "history");
		const outputDir = path.join(workdir, ".memsearch", "sessions");
		await mkdir(outputDir, { recursive: true });

		let updatedCount = 0;

		for (const sessionId of sessionIds) {
			const metadata = loadSessionMetadataFromDB(sessionId, db);
			if (!metadata) continue;

			const lastUpdated = metadata.time.updated;
			const indexed = state.sessions[sessionId];

			if (indexed && indexed.indexedAt >= lastUpdated) {
				continue;
			}
			// Load history from database
			const history = loadMessagesFromDB(sessionId, db);

			// Convert and write markdown
			const md = convertSessionToMarkdown({ metadata, history });
			const outputPath = path.join(outputDir, `${sessionId}.md`);
			await Bun.write(outputPath, md);

			state.sessions[sessionId] = {
				indexedAt: Date.now(),
				source: "db",
			};
			updatedCount++;
		}

		if (updatedCount > 0) {
			state.lastRun = Date.now();
			await saveIndexedState(workdir, state);
			console.log(`memsearch: indexed ${updatedCount} sessions from database`);
		}
	} finally {
		db.close();
	}
}
