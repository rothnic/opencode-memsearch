import fs from "fs";
import os from "os";
import path from "path";

// helpers

export interface MessageEntry {
	ts: string;
	role: string;
	content: string;
	messageID?: string;
	partID?: string;
}

export interface ToolExecutionEntry {
	ts: string;
	type: "tool_execution";
	tool: string;
	args: Record<string, unknown>;
	sessionId?: string;
}

export type JsonlEntry =
	| MessageEntry
	| ToolExecutionEntry
	| Record<string, unknown>;

const DEFAULT_DIR = path.join(
	os.homedir(),
	".config",
	"opencode",
	"memsearch",
	"sessions",
);

function ensureDir(dir: string) {
	try {
		fs.mkdirSync(dir, { recursive: true });
	} catch (e) {}
}

function toAscii(input: string): string {
	return input.replace(/[^\x00-\x7F]/g, "?");
}

function safeString(v: unknown): string {
	if (v == null) return "";
	if (typeof v === "string") return v;
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

function formatTimestamp(ts: string): string {
	try {
		return new Date(ts).toISOString();
	} catch {
		return ts;
	}
}

function escapeMarkdownAscii(text: string): string {
	const ascii = toAscii(text);
	return ascii.replace(/([#`\\])/g, "\\$1");
}

function entryToMarkdown(entry: JsonlEntry): string {
	const ts =
		entry && typeof entry.ts === "string"
			? formatTimestamp(entry.ts)
			: new Date().toISOString();

	if (
		entry &&
		typeof (entry as any).role === "string" &&
		typeof (entry as any).content === "string"
	) {
		const e = entry as MessageEntry;
		const header = `## ${ts} - ${escapeMarkdownAscii(e.role || "unknown")}`;
		const content = escapeMarkdownAscii(e.content || "");
		return `${header}\n\n${content}\n\n`;
	}

	if (entry && (entry as any).type === "tool_execution") {
		const e = entry as ToolExecutionEntry;
		const header = `## ${ts} - tool:${escapeMarkdownAscii(e.tool || "unknown")}`;
		const argsStr = toAscii(safeString(e.args ?? {}));
		return `${header}\n\n\`\`\`json\n${argsStr}\n\`\`\`\n\n`;
	}

	return `## ${ts} - unknown\n\n${escapeMarkdownAscii(safeString(entry))}\n\n`;
}

export function sessionMarkdownPath(
	sessionId: string,
	baseDir = DEFAULT_DIR,
): string {
	const id = sessionId.startsWith("ses_") ? sessionId : `ses_${sessionId}`;
	return path.join(baseDir, `${id}.md`);
}

export function initSessionMarkdown(
	sessionId: string,
	baseDir = DEFAULT_DIR,
): string {
	const dest = sessionMarkdownPath(sessionId, baseDir);
	ensureDir(path.dirname(dest));
	if (!fs.existsSync(dest)) {
		const title = `# Session: ${sessionId.startsWith("ses_") ? sessionId : `ses_${sessionId}`}\n\n`;
		try {
			fs.writeFileSync(dest, toAscii(title), { encoding: "utf-8" });
		} catch (e) {}
	}
	return dest;
}

export function appendEntryToSessionMarkdown(
	sessionId: string,
	entry: JsonlEntry,
	baseDir = DEFAULT_DIR,
): string {
	try {
		const file = initSessionMarkdown(sessionId, baseDir);
		const md = entryToMarkdown(entry);
		fs.appendFileSync(file, toAscii(md), { encoding: "utf-8" });
		return file;
	} catch (err) {
		// log
		console.error("session-to-markdown: failed to append entry", err);
		return sessionMarkdownPath(sessionId, baseDir);
	}
}

export default {
	sessionMarkdownPath,
	initSessionMarkdown,
	appendEntryToSessionMarkdown,
};
