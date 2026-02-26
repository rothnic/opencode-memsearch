#!/usr/bin/env bun
/**
 * Script to extract memories from UDD sessions (demonstration)
 * This simulates what the memory extraction agent would do
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WORKDIR = "/Users/nroth/workspace/udd";
const MEMORY_DIR = path.join(WORKDIR, "memory");

interface MemoryExtract {
	memoryType: string;
	collection: string;
	title: string;
	content: string;
	confidence: number;
	metadata: {
		sessionId: string;
		tags: string[];
		technologies: string[];
		extractedAt: string;
		projectPath: string;
	};
}

// Simple extraction patterns for demonstration
function extractDecisions(content: string, sessionId: string): MemoryExtract[] {
	const decisions: MemoryExtract[] = [];

	// Look for decision patterns
	const decisionPatterns = [
		/decided to ([^.]+)/gi,
		/decision is ([^.]+)/gi,
		/let's go with ([^.]+)/gi,
		/choosing ([^.]+)/gi,
		/we should (?:always|never|use|implement) ([^.]+)/gi,
	];

	for (const pattern of decisionPatterns) {
		const matches = content.matchAll(pattern);
		for (const match of matches) {
			const decisionText = match[1].trim();
			if (decisionText.length > 10 && decisionText.length < 200) {
				decisions.push({
					memoryType: "decision",
					collection: "memory_decision",
					title: `Decision: ${decisionText.substring(0, 50)}...`,
					content: `**Decision**: ${decisionText}\n\n**Context**: Extracted from session ${sessionId}\n\n**Rationale**: Based on analysis of the conversation, this was a key decision point.`,
					confidence: 0.75,
					metadata: {
						sessionId,
						tags: ["decision", "architecture"],
						technologies: [],
						extractedAt: new Date().toISOString(),
						projectPath: WORKDIR,
					},
				});
			}
		}
	}

	return decisions.slice(0, 3); // Limit to 3 per session for demo
}

function extractConventions(
	content: string,
	sessionId: string,
): MemoryExtract[] {
	const conventions: MemoryExtract[] = [];

	// Look for convention patterns
	const conventionPatterns = [
		/convention is ([^.]+)/gi,
		/standard practice[^.]+/gi,
		/naming convention[^.]+/gi,
		/we should always ([^.]+)/gi,
		/let's standardize ([^.]+)/gi,
	];

	for (const pattern of conventionPatterns) {
		const matches = content.matchAll(pattern);
		for (const match of matches) {
			const conventionText = match[0].trim();
			if (conventionText.length > 15 && conventionText.length < 300) {
				conventions.push({
					memoryType: "convention",
					collection: "memory_convention",
					title: `Convention: ${conventionText.substring(0, 45)}...`,
					content: `**Convention**: ${conventionText}\n\n**Source**: Session ${sessionId}\n\n**Applies to**: Project-wide`,
					confidence: 0.7,
					metadata: {
						sessionId,
						tags: ["convention", "coding-standard"],
						technologies: [],
						extractedAt: new Date().toISOString(),
						projectPath: WORKDIR,
					},
				});
			}
		}
	}

	return conventions.slice(0, 2);
}

function extractContext(content: string, sessionId: string): MemoryExtract[] {
	const contexts: MemoryExtract[] = [];

	// Extract project context
	const lines = content.split("\n");
	const contextBuffer = [];

	for (const line of lines) {
		if (
			line.includes("project") ||
			line.includes("context") ||
			line.includes("important")
		) {
			contextBuffer.push(line.trim());
		}
	}

	if (contextBuffer.length > 0) {
		const contextText = contextBuffer.slice(0, 5).join("\n");
		contexts.push({
			memoryType: "context",
			collection: "memory_context",
			title: `Context from ${sessionId.substring(0, 20)}...`,
			content: `**Project Context**:\n\n${contextText.substring(0, 500)}\n\n**Source**: Session ${sessionId}`,
			confidence: 0.65,
			metadata: {
				sessionId,
				tags: ["context", "project-info"],
				technologies: [],
				extractedAt: new Date().toISOString(),
				projectPath: WORKDIR,
			},
		});
	}

	return contexts;
}

async function processSession(sessionId: string): Promise<void> {
	console.log(`Extracting memories from: ${sessionId}`);

	const mdPath = path.join(
		WORKDIR,
		".memsearch",
		"sessions",
		`${sessionId}.md`,
	);
	let content: string;

	try {
		content = await readFile(mdPath, "utf-8");
	} catch (e) {
		console.error(`  ✗ Failed to read markdown file`);
		return;
	}

	// Extract memories
	const decisions = extractDecisions(content, sessionId);
	const conventions = extractConventions(content, sessionId);
	const contexts = extractContext(content, sessionId);

	const allExtracts = [...decisions, ...conventions, ...contexts];
	console.log(`  ✓ Found ${allExtracts.length} potential memories:`);
	console.log(`    - ${decisions.length} decisions`);
	console.log(`    - ${conventions.length} conventions`);
	console.log(`    - ${contexts.length} context items`);

	// Save extracts to memory directories
	for (const extract of allExtracts) {
		const typeDir = path.join(MEMORY_DIR, extract.memoryType);
		await mkdir(typeDir, { recursive: true });

		const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.md`;
		const filePath = path.join(typeDir, filename);

		const frontmatter = `---
memory_type: ${extract.memoryType}
collection: ${extract.collection}
title: "${extract.title}"
confidence: ${extract.confidence}
session_id: ${extract.metadata.sessionId}
extracted_at: ${extract.metadata.extractedAt}
tags: [${extract.metadata.tags.map((t) => `"${t}"`).join(", ")}]
technologies: [${extract.metadata.technologies.map((t) => `"${t}"`).join(", ")}]
---

`;

		await writeFile(filePath, frontmatter + extract.content);
		console.log(`    ✓ Saved to memory/${extract.memoryType}/${filename}`);
	}
}

async function main() {
	console.log("Extracting memories from UDD sessions...\n");

	const sessionsDir = path.join(WORKDIR, ".memsearch", "sessions");
	const files = await readdir(sessionsDir);
	const sessionFiles = files.filter((f) => f.endsWith(".md"));

	for (const file of sessionFiles) {
		const sessionId = file.replace(".md", "");
		await processSession(sessionId);
		console.log("");
	}

	console.log("Done! Check memory/ directories for extracted memories.");
}

main().catch(console.error);
