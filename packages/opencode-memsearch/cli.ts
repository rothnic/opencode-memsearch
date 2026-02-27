#!/usr/bin/env bun
/**
 * Memsearch CLI - Unified interface for memsearch operations
 * Combines Python memsearch CLI with Bunqueue plugin commands
 *
 * Usage: memsearch-ts [command] [options]
 *
 * Commands:
 *   index, search, stats, etc. - Delegated to Python memsearch CLI
 *   queue-status               - Bunqueue status from OpenCode plugin
 *   queue-watch                - Watch queue in real-time
 */

import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";

const PYTHON_MEMSEARCH = "/usr/local/bin/memsearch";
const BUNQUEUE_SCRIPT = join(
	homedir(),
	"workspace",
	"opencode-memsearch",
	"packages",
	"opencode-memsearch",
	"scripts",
	"queue-status.ts",
);

// Commands that should be handled by Python memsearch
const PYTHON_COMMANDS = [
	"index",
	"search",
	"stats",
	"compact",
	"expand",
	"watch",
	"config",
	"reset",
	"transcript",
	"doctor",
];

// Commands handled by this CLI (bunqueue integration)
const TS_COMMANDS = ["queue-status", "queue-watch", "queue"];

function showHelp() {
	console.log(`
Memsearch CLI - Unified Interface

Usage: memsearch-ts <command> [options]

Python memsearch commands (delegated):
  index PATHS...        Index markdown files
  search QUERY          Search indexed memory
  stats                 Show index statistics
  compact               Compress memories into summary
  expand CHUNK          Expand memory chunk to full context
  watch PATHS...        Watch for changes and auto-index
  config                Manage configuration
  doctor                Run diagnostics
  reset                 Drop all indexed data
  transcript FILE       View conversation transcript

Bunqueue plugin commands:
  queue-status          Show global queue status
  queue-watch           Watch queue in real-time
  queue                 Alias for queue-status

Global Options:
  -h, --help            Show this help
  -v, --version         Show version

Examples:
  memsearch-ts index ./docs              # Index docs
  memsearch-ts search "auth flow"        # Search memories
  memsearch-ts queue-status              # Show queue status
  memsearch-ts queue-status --watch      # Watch queue
  memsearch-ts queue-status -s active    # Show active jobs
`);
}

function runPythonMemsearch(args: string[]) {
	const proc = spawn(PYTHON_MEMSEARCH, args, {
		stdio: "inherit",
		env: process.env,
	});

	proc.on("error", (err) => {
		console.error(`Failed to run memsearch: ${err.message}`);
		process.exit(1);
	});

	proc.on("exit", (code) => {
		process.exit(code || 0);
	});
}

function runQueueStatus(args: string[]) {
	const proc = spawn("bun", [BUNQUEUE_SCRIPT, ...args], {
		stdio: "inherit",
		env: process.env,
	});

	proc.on("error", (err) => {
		console.error(`Failed to run queue-status: ${err.message}`);
		process.exit(1);
	});

	proc.on("exit", (code) => {
		process.exit(code || 0);
	});
}

function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	// Handle help
	if (!command || command === "-h" || command === "--help") {
		showHelp();
		process.exit(0);
	}

	// Handle version
	if (command === "-v" || command === "--version") {
		console.log("memsearch-ts 0.1.0");
		console.log("Python memsearch + Bunqueue plugin integration");
		process.exit(0);
	}

	// Route to appropriate handler
	if (PYTHON_COMMANDS.includes(command)) {
		runPythonMemsearch(args);
	} else if (TS_COMMANDS.includes(command)) {
		// Remove the command from args and pass rest to queue-status
		const queueArgs = args.slice(1);

		// Convert queue-watch to queue-status --watch
		if (command === "queue-watch") {
			queueArgs.unshift("--watch");
		}

		runQueueStatus(queueArgs);
	} else {
		console.error(`Unknown command: ${command}`);
		console.error(`\nRun 'memsearch-ts --help' for usage.`);
		process.exit(1);
	}
}

main();
