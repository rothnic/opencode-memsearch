#!/usr/bin/env bun
/**
 * Script to manually process UDD sessions and create markdown files
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Session IDs for UDD project
const SESSION_IDS = [
	"ses_53f0fa4dcffe4WcUeqzm6E7x9Y",
	"ses_542daa7c3ffeQOsRHVoz3KsEwj",
	"ses_542a3342effeUWu2K9KOkM6qAm",
];

const PROJECT_ID = "ad761ea6174e58ed763fc75290c3f403ed51079d";
const WORKDIR = "/Users/nroth/workspace/udd";
const STORAGE_DIR = `/Users/nroth/.local/share/opencode/storage`;

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

async function loadSessionMetadata(
	sessionId: string,
): Promise<SessionMetadata | null> {
	const metadataPath = path.join(
		STORAGE_DIR,
		"session",
		PROJECT_ID,
		`${sessionId}.json`,
	);
	try {
		const content = await readFile(metadataPath, "utf-8");
		return JSON.parse(content);
	} catch (e) {
		console.error(`Failed to load metadata for ${sessionId}:`, e);
		return null;
	}
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
				// Skip malformed entries
			}
		}

		// Sort by timestamp
		entries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
	} catch (e) {
		console.error(`Failed to load messages for ${sessionId}:`, e);
	}

	return entries;
}

async function processSession(sessionId: string): Promise<void> {
	console.log(`Processing session: ${sessionId}`);

	const metadata = await loadSessionMetadata(sessionId);
	if (!metadata) {
		console.error(`  ✗ Failed to load metadata`);
		return;
	}

	const history = await loadSessionMessages(sessionId);
	console.log(`  ✓ Loaded ${history.length} messages`);

	const session: SessionWithHistory = { metadata, history };
	const markdown = convertSessionToMarkdown(session);

	// Write markdown file
	const outputDir = path.join(WORKDIR, ".memsearch", "sessions");
	await mkdir(outputDir, { recursive: true });
	const outputPath = path.join(outputDir, `${sessionId}.md`);
	await writeFile(outputPath, markdown);
	console.log(`  ✓ Written to ${outputPath}`);

	const indexedPath = path.join(WORKDIR, ".memsearch", "indexed.json");
	let indexedState: any = { sessions: {}, lastRun: Date.now() };
	try {
		const existing = await readFile(indexedPath, "utf-8");
		indexedState = JSON.parse(existing);
	} catch (e) {
		// File doesn't exist yet
	}

	indexedState.sessions[sessionId] = {
		indexedAt: Date.now(),
		source: "manual",
	};
	indexedState.lastRun = Date.now();

	await writeFile(indexedPath, JSON.stringify(indexedState, null, 2));
	console.log(`  ✓ Updated indexed.json`);
}

async function main() {
	console.log("Processing UDD sessions...\n");

	for (const sessionId of SESSION_IDS) {
		await processSession(sessionId);
		console.log("");
	}

	console.log("Done! Check .memsearch/sessions/ for markdown files.");
}

main().catch(console.error);
