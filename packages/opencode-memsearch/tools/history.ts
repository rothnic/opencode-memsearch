import { tool } from "@opencode-ai/plugin";
import { $ } from "bun";

export const memHistoryTool = tool({
	description: "Show history of memory creation and updates across projects",
	args: {
		limit: tool.schema
			.number()
			.optional()
			.describe("Maximum number of entries to show (default: 20)"),
		project: tool.schema
			.string()
			.optional()
			.describe("Filter by project ID or directory"),
		since: tool.schema
			.string()
			.optional()
			.describe("Show entries since this date (ISO format, e.g., 2024-01-01)"),
		format: tool.schema
			.enum(["table", "json"])
			.optional()
			.describe("Output format"),
	},

	async execute(rawArgs, _context) {
		try {
			const args = rawArgs as {
				limit?: number;
				project?: string;
				since?: string;
				format?: "table" | "json";
			};
			const limit = args.limit || 20;
			const projectFilter = args.project;
			const since = args.since ? new Date(args.since) : null;
			const format = args.format || "table";

			const checkResult = await $`which memsearch`.quiet().nothrow();
			if (checkResult.exitCode !== 0) {
				return "memsearch CLI not found. Please install it with: pip install memsearch";
			}

			const result = await $`memsearch list-collections --output json`
				.quiet()
				.nothrow();

			if (result.exitCode !== 0) {
				return "Failed to get collections from memsearch";
			}

			const stdout = result.stdout;
			const collections = JSON.parse(
				typeof stdout === "string" ? stdout : stdout.toString() || "[]",
			);

			const history: Array<{
				timestamp: string;
				sessionId: string;
				projectId?: string;
				type: string;
				details?: string;
			}> = [];

			for (const collection of collections) {
				if (projectFilter && !collection.name.includes(projectFilter)) {
					continue;
				}

				const statsResult =
					await $`memsearch stats ${collection.name} --output json`
						.quiet()
						.nothrow();

				if (statsResult.exitCode === 0) {
					const statsStdout = statsResult.stdout;
					const stats = JSON.parse(
						typeof statsStdout === "string"
							? statsStdout
							: statsStdout.toString() || "{}",
					);
					history.push({
						timestamp: stats.lastModified || new Date().toISOString(),
						sessionId: collection.name,
						projectId: collection.name,
						type: "updated",
						details: `${stats.documentCount || 0} documents`,
					});
				}
			}

			history.sort(
				(a, b) =>
					new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
			);

			let filtered = history;
			if (since) {
				filtered = filtered.filter(
					(entry) => new Date(entry.timestamp) >= since,
				);
			}
			if (projectFilter) {
				filtered = filtered.filter(
					(entry) =>
						entry.projectId?.includes(projectFilter) ||
						entry.sessionId?.includes(projectFilter),
				);
			}

			filtered = filtered.slice(0, limit);

			if (format === "json") {
				return JSON.stringify(filtered, null, 2);
			}

			if (filtered.length === 0) {
				return "No memory history found.";
			}

			const table = [
				"| Time | Project/Session | Type | Details |",
				"|------|-----------------|------|----------|",
				...filtered.map((entry) => {
					const time = new Date(entry.timestamp).toLocaleString();
					const name = entry.projectId || entry.sessionId;
					return `| ${time} | ${name} | ${entry.type} | ${entry.details || "-"} |`;
				}),
			].join("\n");

			return table;
		} catch (error) {
			console.error("Error in mem-history tool:", error);
			return `Failed to retrieve memory history: ${error}`;
		}
	},
});

export default memHistoryTool;
