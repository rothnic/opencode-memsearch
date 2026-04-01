import Database from "bun:sqlite";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface PartData {
	type: string;
	text?: string;
	metadata?: any;
	reason?: string;
	cost?: number;
	tokens?: any;
	state?: {
		status?: string;
		input?: any;
		output?: any;
		title?: string;
		metadata?: any;
		time?: number;
	};
	callID?: string;
	tool?: string;
}

interface Part {
	id: string;
	message_id: string;
	session_id: string;
	time_created: number;
	data: PartData;
}

interface MessageData {
	role: string;
	time: { created: number };
	summary?: { title?: string; diffs?: any[] };
	agent?: string;
	model?: { providerID: string; modelID: string };
	variant?: string;
}

interface Message {
	id: string;
	session_id: string;
	time_created: number;
	data: MessageData;
	parts: Part[];
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

function getMarkdownPath(sessionId: string, directory: string): string {
	const memsearchDir = join(directory, ".memsearch", "sessions");
	mkdirSync(memsearchDir, { recursive: true });
	return join(memsearchDir, `${sessionId}.md`);
}

async function fetchSessionMessages(sessionId: string): Promise<Message[]> {
	const dbPath = getDatabasePath();

	try {
		const db = new Database(dbPath, { readonly: true });

		const messageRows = db
			.query(
				`SELECT 
					id,
					session_id,
					time_created,
					data
				 FROM message
				 WHERE session_id = ?
				 ORDER BY time_created ASC`,
			)
			.all(sessionId) as any[];

		const partRows = db
			.query(
				`SELECT 
					id,
					message_id,
					session_id,
					time_created,
					data
				 FROM part
				 WHERE session_id = ?
				 ORDER BY time_created ASC`,
			)
			.all(sessionId) as any[];

		db.close();

		const partsByMessage = new Map<string, Part[]>();
		for (const row of partRows) {
			try {
				const part: Part = {
					id: row.id,
					message_id: row.message_id,
					session_id: row.session_id,
					time_created: row.time_created,
					data: JSON.parse(row.data || "{}"),
				};
				if (!partsByMessage.has(row.message_id)) {
					partsByMessage.set(row.message_id, []);
				}
				partsByMessage.get(row.message_id)!.push(part);
			} catch {
				continue;
			}
		}

		const messages: Message[] = [];
		for (const row of messageRows) {
			try {
				const message: Message = {
					id: row.id,
					session_id: row.session_id,
					time_created: row.time_created,
					data: JSON.parse(row.data || "{}"),
					parts: partsByMessage.get(row.id) || [],
				};
				messages.push(message);
			} catch {
				continue;
			}
		}

		return messages;
	} catch {
		return [];
	}
}

function formatMessage(message: Message): string {
	const timestamp = new Date(message.time_created).toISOString();
	const role = message.data.role || "unknown";

	const textParts: string[] = [];
	const toolOutputs: string[] = [];

	for (const part of message.parts) {
		if (part.data.type === "step-start" || part.data.type === "step-finish") {
			continue;
		}

		if (part.data.text) {
			textParts.push(part.data.text);
		}

		if (part.data.type === "tool" && part.data.state) {
			const toolName = part.data.tool || part.data.state.title || "tool";

			if (part.data.state.output) {
				let output = part.data.state.output;
				if (typeof output === "string") {
					toolOutputs.push(
						`**${toolName}:**\n\n\`\`\`\n${output.substring(0, 500)}${output.length > 500 ? "..." : ""}\n\`\`\``,
					);
				} else {
					toolOutputs.push(
						`**${toolName}:**\n\n\`\`\`\n${JSON.stringify(output, null, 2).substring(0, 500)}\n\`\`\``,
					);
				}
			}

			if (!part.data.state.output && part.data.state.input) {
				const input = part.data.state.input;
				toolOutputs.push(
					`**${toolName}** (input): ${JSON.stringify(input).substring(0, 200)}`,
				);
			}
		}
	}

	const allContent: string[] = [];
	if (textParts.length > 0) {
		allContent.push(textParts.join("\n\n"));
	}
	if (toolOutputs.length > 0) {
		allContent.push(toolOutputs.join("\n\n"));
	}

	const content = allContent.join("\n\n");

	if (!content) {
		const summary = message.data.summary?.title;
		if (summary) {
			return `## ${role} (${timestamp})\n\n${summary}`;
		}
		return `## ${role} (${timestamp})\n\n(no content)`;
	}

	return `## ${role} (${timestamp})\n\n${content}`;
}

export async function generateSessionMarkdown(
	sessionId: string,
	directory: string,
): Promise<void> {
	const markdownPath = getMarkdownPath(sessionId, directory);

	if (existsSync(markdownPath)) {
		const stats = await import("fs").then((fs) => fs.statSync(markdownPath));
		const ageMs = Date.now() - stats.mtimeMs;
		if (ageMs < 60 * 60 * 1000) {
			return;
		}
	}

	const messages = await fetchSessionMessages(sessionId);

	if (messages.length === 0) {
		return;
	}

	const content = messages.map(formatMessage).join("\n---\n\n");
	const markdown = `# Session ${sessionId}\n\n${content}`;

	writeFileSync(markdownPath, markdown);
}
