#!/usr/bin/env bun
import { Database } from "bun:sqlite";
/**
 * Script to process ALL UDD sessions from database
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ID = "ad761ea6174e58ed763fc75290c3f403ed51079d";
const WORKDIR = "/Users/nroth/workspace/udd";
const STORAGE_DIR = `/Users/nroth/.local/share/opencode/storage`;
const DB_PATH = `/Users/nroth/.local/share/opencode/opencode.db`;

interface SessionMetadata {
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

interface Message {
	id: string;
	sessionID: string;
	role?: string;
	content?: string;
	time?: {
		created: number;
	};
	summary?: {
		title: string;
		body: string;
	};
}

interface SessionHistoryEntry {
	ts: string;
	role?: string;
	content?: string;
	tool?: string;
	args?: any;
	messageID?: string;
}

interface SessionWithHistory {
	metadata: SessionMetadata;
	history: SessionHistoryEntry[];
}

function isSystemMessage(entry: SessionHistoryEntry): boolean {
	if (!entry) return false;
	const role = (entry.role ?? "").toString().toLowerCase();
	if (role === "system") return true;
	if (entry.content && typeof entry.content === "string") {
		const content = entry.content.trim();
		if (/^\[(SYSTEM|ULTRAWORK|SYSTEM,|SYSTEM:|\w+\s+MODE)\b/i.test(content))
			return true;
		if (content.includes("<memsearch-context>")) return true;
		if (/^\[[A-Z\- ]{2,}\]$/.test(content)) return true;
		if (/^\[dotenv@/.test(content)) return true;
		if (/^\[SYSTEM REMINDER\]/i.test(content)) return true;
		if (/^\[backgroun/i.test(content)) return true;
		if (content.length < 20 && /^\[.*\]$/.test(content)) return true;
	}
	return false;
}

function convertSessionToMarkdown(session: SessionWithHistory): string {
	const { metadata, history } = session;
	let md = `# ${metadata.title || "Untitled Session"}\n\n`;
	md += `**ID**: ${metadata.id}\n`;
	md += `**Project ID**: ${metadata.projectID}\n`;
	md += `**Created**: ${new Date(metadata.time.created).toLocaleString()}\n`;
	if (metadata.summary) {
		md += `**Stats**: ${metadata.summary.files} files changed, +${metadata.summary.additions} -${metadata.summary.deletions}\n`;
	}
	md += `\n---\n\n`;

	let filteredCount = 0;
	let totalCount = 0;

	for (const entry of history) {
		totalCount++;
		if (isSystemMessage(entry)) {
			filteredCount++;
			continue;
		}
		if (entry.role) {
			const timestamp = new Date(entry.ts).toLocaleTimeString();
			md += `## ${entry.role.toUpperCase()} (${timestamp})\n\n`;
			md += `${entry.content}\n\n`;
		}
	}

	md += `\n---\n\n`;
	md += `*Filtered ${filteredCount} system messages out of ${totalCount} total messages*\n`;
	return md;
}

async function loadSessionMetadataFromDB(
	sessionId: string,
	db: Database,
): Promise<SessionMetadata | null> {
	const row = db
		.query(
			"SELECT id, title, directory, project_id, time_created, time_updated, summary_additions, summary_deletions, summary_files FROM session WHERE id = ?",
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
		summary: row.summary_additions
			? {
					additions: row.summary_additions,
					deletions: row.summary_deletions,
					files: row.summary_files,
				}
			: undefined,
	};
}

async function loadSessionMessages(
	sessionId: string,
): Promise<SessionHistoryEntry[]> {
	const messageDir = path.join(STORAGE_DIR, "message", sessionId);
	const entries: SessionHistoryEntry[] = [];

	try {
		const files = await readdir(messageDir);
		const messageFiles = files.filter((f) => f.endsWith(".json"));

		for (const file of messageFiles) {
			const filePath = path.join(messageDir, file);
			try {
				const content = await readFile(filePath, "utf-8");
				const message: Message = JSON.parse(content);
				entries.push({
					ts: new Date(message.time?.created || Date.now()).toISOString(),
					role: message.role,
					content: message.summary?.body || message.content,
					messageID: message.id,
				});
			} catch (e) {
				// Skip malformed
			}
		}
		entries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
	} catch (e) {
		// No messages
	}

	return entries;
}

async function getAllSessionIds(db: Database): Promise<string[]> {
	const rows = db
		.query("SELECT id FROM session WHERE project_id = ?")
		.all(PROJECT_ID) as any[];
	return rows.map((r) => r.id);
}

async function processSession(sessionId: string, db: Database): Promise<void> {
	const metadata = await loadSessionMetadataFromDB(sessionId, db);
	if (!metadata) {
		console.error(`  ✗ Failed to load metadata for ${sessionId}`);
		return;
	}

	const history = await loadSessionMessages(sessionId);

	const session: SessionWithHistory = { metadata, history };
	const markdown = convertSessionToMarkdown(session);

	const outputDir = path.join(WORKDIR, ".memsearch", "sessions");
	await mkdir(outputDir, { recursive: true });
	const outputPath = path.join(outputDir, `${sessionId}.md`);
	await writeFile(outputPath, markdown);

	const indexedPath = path.join(WORKDIR, ".memsearch", "indexed.json");
	let indexedState: any = { sessions: {}, lastRun: Date.now() };
	try {
		const existing = await readFile(indexedPath, "utf-8");
		indexedState = JSON.parse(existing);
	} catch (e) {}

	indexedState.sessions[sessionId] = {
		indexedAt: Date.now(),
		source: "database",
	};
	indexedState.lastRun = Date.now();
	await writeFile(indexedPath, JSON.stringify(indexedState, null, 2));
}

async function main() {
	console.log("Processing ALL UDD sessions from database...\n");

	const db = new Database(DB_PATH);
	const sessionIds = await getAllSessionIds(db);
	console.log(`Found ${sessionIds.length} sessions for UDD project\n`);

	let processed = 0;
	let errors = 0;

	for (const sessionId of sessionIds) {
		try {
			await processSession(sessionId, db);
			processed++;
			if (processed % 10 === 0) {
				console.log(
					`  Progress: ${processed}/${sessionIds.length} sessions processed`,
				);
			}
		} catch (e) {
			console.error(`  ✗ Error processing ${sessionId}:`, e);
			errors++;
		}
	}

	db.close();

	console.log(`\nDone! Processed ${processed} sessions (${errors} errors)`);
	console.log(`Session markdown files: ${WORKDIR}/.memsearch/sessions/`);
	console.log(`Index: ${WORKDIR}/.memsearch/indexed.json`);
}

main().catch(console.error);
