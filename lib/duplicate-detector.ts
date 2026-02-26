/**
 * @file duplicate-detector.ts
 * @description Duplicate detection for memory files using text similarity algorithms.
 *              Supports configurable similarity threshold and efficient comparison
 *              for small to medium memory collections.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import type { DeduplicationConfig } from "./config-yaml";

// ============================================
// Types
// ============================================

/** Result of a similarity match */
export interface MatchResult {
	/** Path to the matching memory file */
	path: string;
	/** Similarity score (0.0-1.0) */
	similarity: number;
	/** Memory metadata extracted from frontmatter */
	metadata: MemoryMetadata;
}

/** Metadata extracted from memory file frontmatter */
export interface MemoryMetadata {
	session_id?: string;
	project_path?: string;
	tags?: string[];
	extracted_at?: string;
	[key: string]: unknown;
}

/** Configuration for duplicate detector */
export interface DuplicateDetectorConfig {
	/** Similarity threshold (0.0-1.0) - higher = stricter matching */
	similarityThreshold: number;
	/** Directories to search for existing memories */
	memoryDirs: string[];
	/** File extensions to consider as memory files */
	extensions?: string[];
}

/** Default configuration */
const DEFAULT_EXTENSIONS = [".md", ".txt"];

/**
 * Duplicate detection result
 */
export interface DuplicateDetectionResult {
	/** Whether a duplicate was found */
	isDuplicate: boolean;
	/** Best match if any */
	bestMatch: MatchResult | null;
	/** All matches above threshold */
	allMatches: MatchResult[];
}

// ============================================
// Similarity Algorithms
// ============================================

/**
 * Calculate Levenshtein distance between two strings.
 * This is the number of single-character edits needed to transform one string to another.
 */
function levenshteinDistance(s1: string, s2: string): number {
	const m = s1.length;
	const n = s2.length;

	// Create matrix
	const dp: number[][] = Array(m + 1)
		.fill(null)
		.map(() => Array(n + 1).fill(0));

	// Initialize base cases
	for (let i = 0; i <= m; i++) {
		dp[i][0] = i;
	}
	for (let j = 0; j <= n; j++) {
		dp[0][j] = j;
	}

	// Fill matrix
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (s1[i - 1] === s2[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1];
			} else {
				dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
			}
		}
	}

	return dp[m][n];
}

/**
 * Calculate Levenshtein similarity (0.0-1.0).
 * Higher values indicate more similar strings.
 */
export function getLevenshteinSimilarity(s1: string, s2: string): number {
	if (s1 === s2) return 1.0;
	if (s1.length === 0 || s2.length === 0) return 0.0;

	const maxLen = Math.max(s1.length, s2.length);
	const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
	return 1.0 - distance / maxLen;
}

/**
 * Calculate Jaccard similarity coefficient (0.0-1.0).
 * Based on set intersection of character n-grams.
 */
export function getJaccardSimilarity(
	s1: string,
	s2: string,
	n: number = 3,
): number {
	if (s1 === s2) return 1.0;
	if (s1.length === 0 || s2.length === 0) return 0.0;

	// Create character n-grams
	const createNgrams = (str: string): Set<string> => {
		const normalized = str.toLowerCase().replace(/\s+/g, " ");
		const ngrams = new Set<string>();
		for (let i = 0; i <= normalized.length - n; i++) {
			ngrams.add(normalized.slice(i, i + n));
		}
		return ngrams;
	};

	const ngrams1 = createNgrams(s1);
	const ngrams2 = createNgrams(s2);

	// Calculate intersection
	const intersection = new Set([...ngrams1].filter((x) => ngrams2.has(x)));

	// Calculate union
	const union = new Set([...ngrams1, ...ngrams2]);

	return intersection.size / union.size;
}

/**
 * Calculate cosine similarity using character n-grams with TF-IDF weighting.
 * Better for longer documents where word overlap matters more.
 */
export function getCosineSimilarity(
	s1: string,
	s2: string,
	n: number = 3,
): number {
	if (s1 === s2) return 1.0;
	if (s1.length === 0 || s2.length === 0) return 0.0;

	// Create character n-grams with frequency
	const createNgramVector = (str: string): Map<string, number> => {
		const normalized = str.toLowerCase().replace(/\s+/g, " ");
		const ngrams = new Map<string, number>();
		for (let i = 0; i <= normalized.length - n; i++) {
			const gram = normalized.slice(i, i + n);
			ngrams.set(gram, (ngrams.get(gram) || 0) + 1);
		}
		return ngrams;
	};

	const vec1 = createNgramVector(s1);
	const vec2 = createNgramVector(s2);

	// Get all unique n-grams
	const allNgrams = new Set([...vec1.keys(), ...vec2.keys()]);

	// Calculate dot product
	let dotProduct = 0;
	for (const gram of allNgrams) {
		const freq1 = vec1.get(gram) || 0;
		const freq2 = vec2.get(gram) || 0;
		dotProduct += freq1 * freq2;
	}

	// Calculate magnitudes
	const mag1 = Math.sqrt([...vec1.values()].reduce((sum, v) => sum + v * v, 0));
	const mag2 = Math.sqrt([...vec2.values()].reduce((sum, v) => sum + v * v, 0));

	if (mag1 === 0 || mag2 === 0) return 0.0;

	return dotProduct / (mag1 * mag2);
}

/**
 * Unified similarity function that combines multiple algorithms.
 * Uses weighted combination for better accuracy.
 */
export function getSimilarity(s1: string, s2: string): number {
	if (s1 === s2) return 1.0;
	if (s1.length === 0 || s2.length === 0) return 0.0;

	// Use weighted combination of algorithms
	const levSim = getLevenshteinSimilarity(s1, s2);
	const jacSim = getJaccardSimilarity(s1, s2);
	const cosSim = getCosineSimilarity(s1, s2);

	// Weighted average: give more weight to Jaccard and Cosine for document similarity
	return levSim * 0.2 + jacSim * 0.4 + cosSim * 0.4;
}

// ============================================
// Memory File Parsing
// ============================================

/**
 * Extract frontmatter metadata from a memory file.
 * Supports YAML frontmatter in the format:
 * ---
 * key: value
 * ---
 * content
 */
function extractMetadata(content: string): MemoryMetadata {
	const metadata: MemoryMetadata = {};

	// Check for YAML frontmatter
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (frontmatterMatch) {
		const frontmatter = frontmatterMatch[1];
		// Parse simple key: value pairs
		const lines = frontmatter.split("\n");
		for (const line of lines) {
			const match = line.match(/^(\w+):\s*(.*)$/);
			if (match) {
				const [, key, value] = match;
				// Try to parse as array, otherwise string
				if (value.startsWith("[") && value.endsWith("]")) {
					metadata[key] = value
						.slice(1, -1)
						.split(",")
						.map((v) => v.trim());
				} else {
					metadata[key] = value.trim();
				}
			}
		}
	}

	return metadata;
}

/**
 * Read content from a memory file.
 * Returns the full content including frontmatter.
 */
function readMemoryFile(filePath: string): string | null {
	try {
		if (!existsSync(filePath)) {
			return null;
		}
		return readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
}

// ============================================
// Duplicate Detector Class
// ============================================

/**
 * DuplicateDetector - Finds similar memory files using text comparison.
 *
 * Supports configurable similarity threshold and efficient searching
 * through existing memory directories.
 */
export class DuplicateDetector {
	private config: DuplicateDetectorConfig;
	private extensions: string[];

	constructor(config: DuplicateDetectorConfig) {
		this.config = config;
		this.extensions = config.extensions ?? DEFAULT_EXTENSIONS;
	}

	/**
	 * Create a DuplicateDetector from DeduplicationConfig and project directory.
	 */
	static fromConfig(
		deduplicationConfig: DeduplicationConfig,
		projectDir: string,
		memoryType?: string,
	): DuplicateDetector {
		const memoryDirs: string[] = [];

		// If specific memory type provided, only search that directory
		if (memoryType) {
			memoryDirs.push(path.join(projectDir, "memory", memoryType));
		} else {
			// Search all memory directories
			const memoryBase = path.join(projectDir, "memory");
			if (existsSync(memoryBase)) {
				try {
					const entries = readdirSync(memoryBase, { withFileTypes: true });
					for (const entry of entries) {
						if (entry.isDirectory()) {
							memoryDirs.push(path.join(memoryBase, entry.name));
						}
					}
				} catch {
					// Ignore errors, memoryDirs will be empty
				}
			}
		}

		return new DuplicateDetector({
			similarityThreshold: deduplicationConfig.similarityThreshold ?? 0.85,
			memoryDirs,
			extensions: DEFAULT_EXTENSIONS,
		});
	}

	/**
	 * Get all memory files from configured directories.
	 */
	private getMemoryFiles(): string[] {
		const files: string[] = [];

		for (const dir of this.config.memoryDirs) {
			if (!existsSync(dir) || !statSync(dir).isDirectory()) {
				continue;
			}

			try {
				const entries = readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isFile()) {
						const ext = path.extname(entry.name).toLowerCase();
						if (this.extensions.includes(ext)) {
							files.push(path.join(dir, entry.name));
						}
					}
				}
			} catch {
				// Skip directories we can't read
			}
		}

		return files;
	}

	/**
	 * Find similar memories to the given content.
	 * Returns all matches above the similarity threshold.
	 */
	findSimilar(content: string, threshold?: number): MatchResult[] {
		const effectiveThreshold = threshold ?? this.config.similarityThreshold;
		const memoryFiles = this.getMemoryFiles();
		const results: MatchResult[] = [];

		for (const filePath of memoryFiles) {
			const fileContent = readMemoryFile(filePath);
			if (!fileContent) continue;

			// Calculate similarity between input content and existing memory
			const similarity = getSimilarity(content, fileContent);

			if (similarity >= effectiveThreshold) {
				results.push({
					path: filePath,
					similarity,
					metadata: extractMetadata(fileContent),
				});
			}
		}

		// Sort by similarity descending
		results.sort((a, b) => b.similarity - a.similarity);

		return results;
	}

	/**
	 * Check if the content is a duplicate of any existing memory.
	 * Returns true if similarity exceeds the threshold.
	 */
	isDuplicate(content: string, threshold?: number): boolean {
		const matches = this.findSimilar(content, threshold);
		return matches.length > 0;
	}

	/**
	 * Get similarity score between content and a specific file.
	 */
	getSimilarity(content: string, filePath: string): number {
		const fileContent = readMemoryFile(filePath);
		if (!fileContent) return 0.0;
		return getSimilarity(content, fileContent);
	}

	/**
	 * Perform full duplicate detection analysis.
	 */
	detectDuplicates(content: string): DuplicateDetectionResult {
		const matches = this.findSimilar(content);

		return {
			isDuplicate: matches.length > 0,
			bestMatch: matches[0] ?? null,
			allMatches: matches,
		};
	}

	/**
	 * Get the configured similarity threshold.
	 */
	getThreshold(): number {
		return this.config.similarityThreshold;
	}

	/**
	 * Set a new similarity threshold.
	 */
	setThreshold(threshold: number): void {
		this.config.similarityThreshold = Math.max(0, Math.min(1, threshold));
	}

	/**
	 * Get list of memory directories being searched.
	 */
	getMemoryDirs(): string[] {
		return [...this.config.memoryDirs];
	}

	/**
	 * Count total memory files in configured directories.
	 */
	getMemoryCount(): number {
		return this.getMemoryFiles().length;
	}
}

// ============================================
// Utility Functions
// ============================================

/**
 * Quick similarity check between two strings.
 * Convenience function for one-off comparisons.
 */
export function checkSimilarity(
	s1: string,
	s2: string,
	threshold: number = 0.85,
): boolean {
	return getSimilarity(s1, s2) >= threshold;
}

/**
 * Get detailed similarity info between two strings.
 */
export function compareStrings(
	s1: string,
	s2: string,
): {
	levenshtein: number;
	jaccard: number;
	cosine: number;
	combined: number;
} {
	return {
		levenshtein: getLevenshteinSimilarity(s1, s2),
		jaccard: getJaccardSimilarity(s1, s2),
		cosine: getCosineSimilarity(s1, s2),
		combined: getSimilarity(s1, s2),
	};
}

export default DuplicateDetector;
