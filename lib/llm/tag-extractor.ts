/**
 * @file tag-extractor.ts
 * @description Technology/framework tag extraction from session content.
 *              Supports configurable per-memory-type tag extraction with
 *              keyword matching and heuristic detection.
 */

import type { MemoryTypeConfig, TagListConfig } from "./config-yaml";

// ============================================
// Types
// ============================================

/** Result of tag extraction */
export interface ExtractionResult {
	/** Whether extraction succeeded */
	ok: true;
	/** Extracted technology tags */
	tags: string[];
	/** Confidence scores for each tag (0.0-1.0) */
	confidence: Record<string, number>;
	/** Memory type used for extraction */
	memoryType?: string;
}

/** Error result for tag extraction */
export interface ExtractionError {
	ok: false;
	error: string;
	code: ExtractionErrorCode;
}

/** Error codes for extraction failures */
export type ExtractionErrorCode =
	| "empty_content"
	| "invalid_memory_type"
	| "config_error";

/** Union type for extraction results */
export type TagExtractionResult = ExtractionResult | ExtractionError;

/** Configuration for tag extractor */
export interface TagExtractorConfig {
	/** Default tag list to use when no memory type specified */
	defaultTags: string[];
	/** Per-memory-type tag configurations */
	memoryTypeTags?: Record<string, TagListConfig[]>;
	/** Custom tags added at runtime */
	customTags?: string[];
	/** Minimum confidence threshold (0.0-1.0) */
	minConfidence?: number;
	/** Enable heuristic detection (file extensions, imports, etc.) */
	enableHeuristics?: boolean;
}

// ============================================
// Technology Detection Data
// ============================================

/** Comprehensive list of technologies to detect */
const TECHNOLOGY_KEYWORDS: Record<string, string[]> = {
	// Frontend Frameworks
	React: ["react", "reactjs", "react.js", "react-dom"],
	Vue: ["vue", "vuejs", "vue.js", "vuejs3"],
	Angular: ["angular", "angularjs", "angular.js"],
	Svelte: ["svelte", "sveltejs", "svelte-kit"],
	Next: ["next.js", "nextjs", "next"],
	Nuxt: ["nuxt", "nuxtjs", "nuxt.js"],
	Remix: ["remix", "remix-run"],
	Astro: ["astro", "astrojs"],

	// JavaScript/TypeScript
	JavaScript: ["javascript", "js ", " vanilla js", "vanilla javascript"],
	TypeScript: ["typescript", "ts ", "ts.", "tsconfig"],
	"Node.js": ["node.js", "nodejs", "node "],
	Bun: ["bun", "bun.sh"],
	Deno: ["deno", "deno deploy"],

	// Backend Languages
	Python: [
		"python",
		"python3",
		"py ",
		"pip ",
		"pypi",
		"django",
		"flask",
		"fastapi",
		"pyenv",
	],
	Go: ["go ", "golang", " go-", "gopher"],
	Rust: ["rust", "rustlang", "cargo", "crates.io"],
	Java: ["java ", "java,", "spring", "maven", "gradle", "jvm", "jdk"],
	CSharp: ["c#", "csharp", ".net", "dotnet", "asp.net"],
	Cpp: ["c++", "cpp", "c/c++"],
	Ruby: ["ruby", "rails", "rubygems"],
	PHP: ["php", "laravel", "symfony"],
	Swift: ["swift", "swiftui"],
	Kotlin: ["kotlin", "android"],

	// Databases
	PostgreSQL: ["postgresql", "postgres", "psql", "pg "],
	MySQL: ["mysql", "mariadb"],
	MongoDB: ["mongodb", "mongo "],
	Redis: ["redis", "redis-server"],
	SQLite: ["sqlite", "sqlite3"],
	Elasticsearch: ["elasticsearch", "elastic "],
	Supabase: ["supabase"],
	Firebase: ["firebase"],

	// Cloud & DevOps
	AWS: [
		"aws",
		"amazon web services",
		"s3",
		"ec2",
		"lambda",
		"dynamodb",
		"rds",
		"sqs",
		"sns",
		"cloudformation",
		"sam ",
	],
	GCP: [
		"gcp",
		"google cloud",
		"google cloud platform",
		"cloud run",
		"gke",
		"bigquery",
		"firestore",
	],
	Azure: ["azure", "microsoft azure", "azure functions", "app service"],
	Kubernetes: ["kubernetes", "k8s", "kubectl", "helm", "helm chart"],
	Docker: ["docker", "dockerfile", "docker-compose", "containerd"],
	Terraform: ["terraform", "terrform", "tf "],
	Cloudflare: ["cloudflare", "workers", "pages "],

	// AI/ML
	OpenAI: ["openai", "gpt-", "chatgpt", "dall-e", "whisper"],
	Anthropic: ["anthropic", "claude", "claude.ai"],
	LangChain: ["langchain", "lang smith"],
	LlamaIndex: ["llamaindex", "llama index"],
	Mastra: ["mastra", "mastra.ai"],
	VectorDB: [
		"vector db",
		"vector database",
		"pinecone",
		"weaviate",
		"chroma",
		"qdrant",
	],

	// Testing
	Jest: ["jest", "testing library"],
	Vitest: ["vitest"],
	Cypress: ["cypress"],
	Playwright: ["playwright"],
	Mocha: ["mocha"],
	Pytest: ["pytest"],
	JUnit: ["junit"],

	// Build Tools
	Webpack: ["webpack"],
	Vite: ["vite", "vitejs"],
	Turborepo: ["turborepo", "turborepo"],
	ESLint: ["eslint"],
	Prettier: ["prettier"],
	Biome: ["biome", "biomejs"],

	// Other Tools
	Git: ["git", "github", "gitlab", "bitbucket"],
	GitHub: ["github"],
	GitLab: ["gitlab"],
	VSCode: ["vscode", "visual studio code"],
	Vim: ["vim", "neovim", "nvim"],
	Linux: ["linux", "ubuntu", "debian", "fedora", "arch "],
	macOS: ["macos", "darwin", "apple silicon"],
	Windows: ["windows", "win32", "powershell"],
	Nginx: ["nginx"],
	Apache: ["apache"],
	GraphQL: ["graphql", "apollo server", "urql"],
	REST: ["rest api", "restful", "http "],
	gRPC: ["grpc"],
	WebSocket: ["websocket", "ws "],
	OAuth: ["oauth", "oauth2", "jwt "],
	SSH: ["ssh ", "ssh,"],
	JSON: ["json ", "json,"],
	YAML: ["yaml", "yml "],
	Markdown: ["markdown", "md "],
	TOML: ["toml "],
};

/** File extension to technology mappings */
const EXTENSION_PATTERNS: Record<string, string[]> = {
	".ts": ["TypeScript"],
	".tsx": ["TypeScript", "React"],
	".js": ["JavaScript"],
	".jsx": ["JavaScript", "React"],
	".py": ["Python"],
	".go": ["Go"],
	".rs": ["Rust"],
	".java": ["Java"],
	".cs": ["CSharp", ".NET"],
	".cpp": ["Cpp", "C++"],
	".c": ["C", "Cpp"],
	".rb": ["Ruby"],
	".php": ["PHP"],
	".swift": ["Swift"],
	".kt": ["Kotlin"],
	".scala": ["Scala"],
	".vue": ["Vue"],
	".svelte": ["Svelte"],
	".html": ["HTML", "CSS"],
	".css": ["CSS"],
	".scss": ["SCSS", "Sass"],
	".less": ["Less"],
	".sql": ["SQL", "PostgreSQL", "MySQL"],
	".sh": ["Shell", "Bash"],
	".bash": ["Bash", "Shell"],
	".zsh": ["Zsh", "Shell"],
	".yaml": ["YAML"],
	".yml": ["YAML"],
	".json": ["JSON"],
	".toml": ["TOML"],
	".xml": ["XML"],
	".md": ["Markdown"],
	".dockerfile": ["Docker"],
	".tf": ["Terraform"],
	".proto": ["gRPC", "Protocol Buffers"],
};

/** Import/require patterns for specific technologies */
const IMPORT_PATTERNS: Record<string, RegExp[]> = {
	React: [
		/import\s+.*\s+from\s+['"]react['"]/,
		/require\s*\(\s*['"]react['"]\s*\)/,
		/from\s+['"]react['"]/,
	],
	Vue: [
		/import\s+.*\s+from\s+['"]vue['"]/,
		/import\s+.*\s+from\s+['"]@vue/,
		/import\s+.*\s+from\s+['"]nuxt/,
	],
	Angular: [/import\s+.*\s+from\s+['"]@angular/],
	Svelte: [/import\s+.*\s+from\s+['"]svelte['"]/],
	"Node.js": [
		/require\s*\(\s*['"]fs['"]\s*\)/,
		/require\s*\(\s*['"]path['"]\s*\)/,
		/require\s*\(\s*['"]http['"]\s*\)/,
	],
	Express: [
		/import\s+.*\s+from\s+['"]express['"]/,
		/require\s*\(\s*['"]express['"]\s*\)/,
	],
	Django: [/from\s+django/, /import\s+django/],
	Flask: [/from\s+flask/, /import\s+flask/],
	FastAPI: [/from\s+fastapi/, /import\s+fastapi/],
	LangChain: [/from\s+langchain/, /import\s+langchain/],
	LlamaIndex: [/from\s+llama_index/, /import\s+llama_index/],
	PostgreSQL: [
		/from\s+['"]pg/,
		/require\s*\(\s*['"]pg['"]\s*\)/,
		/import\s+.*\s+from\s+['"]pg/,
	],
	MongoDB: [/from\s+['"]mongodb/, /import\s+.*\s+from\s+['"]mongo/],
	Redis: [/from\s+['"]redis/, /import\s+.*\s+from\s+['"]ioredis/],
	Prisma: [/from\s+['"]@prisma/, /import\s+.*\s+from\s+['"]prisma/],
	TypeScript: [
		/import\s+.*\s+from\s+['"]/,
		/:\s*(string|number|boolean|any|void|never|unknown)\b/,
		/interface\s+\w+/,
		/type\s+\w+\s*=/,
	],
	Python: [
		/def\s+\w+\s*\(/,
		/class\s+\w+.*:/,
		/import\s+\w+/,
		/from\s+\w+\s+import/,
	],
	Go: [
		/package\s+\w+/,
		/func\s+\w+\s*\(/,
		/import\s+\(/,
		/type\s+\w+\s+struct/,
	],
	Rust: [/fn\s+\w+\s*\(/, /let\s+mut\s+/, /impl\s+\w+/, /use\s+\w+::/],
	Docker: [/FROM\s+\w+\/[\w-]+/, /RUN\s+/, /COPY\s+/, /ENTRYPOINT\s+/],
	Kubernetes: [
		/apiVersion:\s*v1/,
		/kind:\s*(Pod|Service|Deployment|ConfigMap)/,
		/metadata:\s*/,
	],
};

// ============================================
// Extraction Logic
// ============================================

/**
 * Count occurrences of a keyword in text (case-insensitive).
 */
function countOccurrences(text: string, keywords: string[]): number {
	const lowerText = text.toLowerCase();
	let count = 0;

	for (const keyword of keywords) {
		const lowerKeyword = keyword.toLowerCase();
		// Use word boundary matching for better accuracy
		const regex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, "gi");
		const matches = lowerText.match(regex);
		if (matches) {
			count += matches.length;
		}
	}

	return count;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Calculate confidence based on occurrence count and context.
 */
function calculateConfidence(
	occurrences: number,
	totalMentions: number,
): number {
	if (occurrences === 0) return 0;

	// Base confidence from occurrence count (logarithmic scale)
	const baseConfidence = Math.min(1.0, Math.log2(occurrences + 1) / 8);

	// Boost for multiple different keywords for same technology
	const contextBoost = Math.min(0.2, totalMentions * 0.02);

	return Math.min(1.0, baseConfidence + contextBoost);
}

/**
 * Detect technologies from file extensions in content.
 */
function detectFromExtensions(content: string): Map<string, number> {
	const detected = new Map<string, number>();

	// Look for file paths with extensions
	const filePathRegex = /\b[\w./-]+\.(\w+)\b/g;
	let match;

	while ((match = filePathRegex.exec(content)) !== null) {
		const ext = "." + match[1].toLowerCase();
		const technologies = EXTENSION_PATTERNS[ext];

		if (technologies) {
			for (const tech of technologies) {
				detected.set(tech, (detected.get(tech) || 0) + 1);
			}
		}
	}

	return detected;
}

/**
 * Detect technologies from import/require statements.
 */
function detectFromImports(content: string): Map<string, number> {
	const detected = new Map<string, number>();

	for (const [tech, patterns] of Object.entries(IMPORT_PATTERNS)) {
		for (const pattern of patterns) {
			if (pattern.test(content)) {
				detected.set(tech, (detected.get(tech) || 0) + 1);
			}
		}
	}

	return detected;
}

/**
 * Detect technologies from keyword occurrences.
 */
function detectFromKeywords(content: string): Map<string, number> {
	const detected = new Map<string, number>();

	for (const [tech, keywords] of Object.entries(TECHNOLOGY_KEYWORDS)) {
		const occurrences = countOccurrences(content, keywords);
		if (occurrences > 0) {
			detected.set(tech, occurrences);
		}
	}

	return detected;
}

// ============================================
// TagExtractor Class
// ============================================

/**
 * TagExtractor - Extracts technology/framework tags from text content.
 *
 * Supports:
 * - Keyword-based detection
 * - File extension heuristics
 * - Import statement detection
 * - Configurable per-memory-type tag lists
 * - Custom runtime tags
 * - Confidence scoring
 */
export class TagExtractor {
	private config: TagExtractorConfig;
	private customTagsSet: Set<string>;

	constructor(config: TagExtractorConfig) {
		this.config = {
			defaultTags: config.defaultTags ?? [],
			memoryTypeTags: config.memoryTypeTags ?? {},
			customTags: config.customTags ?? [],
			minConfidence: config.minConfidence ?? 0.1,
			enableHeuristics: config.enableHeuristics ?? true,
		};
		this.customTagsSet = new Set(
			config.customTags?.map((t) => t.toLowerCase()) ?? [],
		);
	}

	/**
	 * Create a TagExtractor from MemsearchConfig (from config-yaml.ts).
	 */
	static fromConfig(config: {
		memoryTypes?: MemoryTypeConfig[];
		defaults?: { tags?: string[] };
	}): TagExtractor {
		const defaultTags = config.defaults?.tags ?? [];

		// Build per-memory-type tag lists
		const memoryTypeTags: Record<string, TagListConfig[]> = {};

		if (config.memoryTypes) {
			for (const memType of config.memoryTypes) {
				if (memType.tagLists && memType.tagLists.length > 0) {
					memoryTypeTags[memType.name] = memType.tagLists;
				}
			}
		}

		return new TagExtractor({
			defaultTags,
			memoryTypeTags,
			customTags: [],
			minConfidence: 0.1,
			enableHeuristics: true,
		});
	}

	/**
	 * Add custom tags at runtime.
	 */
	addCustomTags(tags: string[]): void {
		for (const tag of tags) {
			this.customTagsSet.add(tag.toLowerCase());
		}
	}

	/**
	 * Get all available tags from configuration.
	 */
	getAvailableTags(memoryType?: string): string[] {
		const tags = new Set<string>();

		// Add default tags
		for (const tag of this.config.defaultTags) {
			tags.add(tag.toLowerCase());
		}

		// Add custom tags
		for (const tag of this.customTagsSet) {
			tags.add(tag);
		}

		// Add memory-type specific tags
		if (memoryType && this.config.memoryTypeTags[memoryType]) {
			for (const tagList of this.config.memoryTypeTags[memoryType]) {
				for (const tag of tagList.tags) {
					tags.add(tag.toLowerCase());
				}
			}
		}

		return Array.from(tags).sort();
	}

	/**
	 * Extract tags from content using default configuration.
	 */
	extractTags(content: string): TagExtractionResult {
		if (!content || content.trim().length === 0) {
			return {
				ok: false,
				error: "Content is empty",
				code: "empty_content",
			};
		}

		const allDetected = new Map<string, number>();

		// Keyword detection (always enabled)
		const keywordDetected = detectFromKeywords(content);
		for (const [tech, count] of keywordDetected) {
			allDetected.set(tech, (allDetected.get(tech) || 0) + count);
		}

		// Heuristic detection (if enabled)
		if (this.config.enableHeuristics) {
			const extensionDetected = detectFromExtensions(content);
			for (const [tech, count] of extensionDetected) {
				allDetected.set(tech, (allDetected.get(tech) || 0) + count);
			}

			const importDetected = detectFromImports(content);
			for (const [tech, count] of importDetected) {
				allDetected.set(tech, (allDetected.get(tech) || 0) + count * 2); // Higher weight for imports
			}
		}

		// Calculate confidence scores
		const confidence: Record<string, number> = {};
		const tags: string[] = [];
		const totalMentions = Array.from(allDetected.values()).reduce(
			(a, b) => a + b,
			0,
		);

		for (const [tech, count] of allDetected) {
			const conf = calculateConfidence(count, totalMentions);
			if (conf >= (this.config.minConfidence ?? 0.1)) {
				confidence[tech] = Math.round(conf * 100) / 100;
				tags.push(tech);
			}
		}

		// Add custom tags that are mentioned in content
		for (const customTag of this.customTagsSet) {
			const lowerCustom = customTag.toLowerCase();
			const customRegex = new RegExp(`\\b${escapeRegex(lowerCustom)}\\b`, "gi");
			if (customRegex.test(content) && !tags.includes(customTag)) {
				tags.push(customTag);
				confidence[customTag] = 0.8;
			}
		}

		// Sort tags by confidence
		tags.sort((a, b) => (confidence[b] || 0) - (confidence[a] || 0));

		return {
			ok: true,
			tags,
			confidence,
		};
	}

	/**
	 * Extract tags from content for a specific memory type.
	 * Uses memory-type-specific tag lists if available.
	 */
	extractTagsForType(content: string, memoryType: string): TagExtractionResult {
		if (!content || content.trim().length === 0) {
			return {
				ok: false,
				error: "Content is empty",
				code: "empty_content",
			};
		}

		// Check if memory type exists in config
		const tagLists = this.config.memoryTypeTags[memoryType];

		// Start with base extraction
		const baseResult = this.extractTags(content);

		if (!baseResult.ok) {
			return baseResult;
		}

		// If no specific tag lists, return base result
		if (!tagLists || tagLists.length === 0) {
			return {
				...baseResult,
				memoryType,
			};
		}

		// Filter and prioritize tags based on memory type configuration
		const allowedTags = new Set<string>();
		const suggestedTags: string[] = [];
		const manageableTags: string[] = [];

		for (const tagList of tagLists) {
			for (const tag of tagList.tags) {
				allowedTags.add(tag.toLowerCase());
				if (tagList.manageable) {
					manageableTags.push(tag.toLowerCase());
				}
			}

			// Add suggested tags from description if available
			if (tagList.description) {
				// Extract potential tags from description
				const descWords = tagList.description
					.split(/\s+/)
					.filter((w) => w.length > 2);
				suggestedTags.push(...descWords.slice(0, 5));
			}
		}

		// Filter extracted tags to only those in allowed list
		const filteredTags: string[] = [];
		const filteredConfidence: Record<string, number> = {};

		for (const tag of baseResult.tags) {
			if (allowedTags.has(tag.toLowerCase())) {
				filteredTags.push(tag);
				filteredConfidence[tag] = baseResult.confidence[tag];
			}
		}

		// Add manageable tags that appear in content but weren't detected
		for (const tag of manageableTags) {
			const tagRegex = new RegExp(`\\b${escapeRegex(tag)}\\b`, "gi");
			if (tagRegex.test(content) && !filteredTags.includes(tag)) {
				filteredTags.push(tag);
				filteredConfidence[tag] = 0.5;
			}
		}

		// If no filtered tags, return base result with memory type
		if (filteredTags.length === 0) {
			return {
				...baseResult,
				memoryType,
			};
		}

		// Re-sort by confidence
		filteredTags.sort(
			(a, b) => (filteredConfidence[b] || 0) - (filteredConfidence[a] || 0),
		);

		return {
			ok: true,
			tags: filteredTags,
			confidence: filteredConfidence,
			memoryType,
		};
	}

	/**
	 * Get configured memory types.
	 */
	getMemoryTypes(): string[] {
		return Object.keys(this.config.memoryTypeTags);
	}

	/**
	 * Get tag lists for a specific memory type.
	 */
	getTagListsForType(memoryType: string): TagListConfig[] | undefined {
		return this.config.memoryTypeTags[memoryType];
	}

	/**
	 * Check if a memory type is configured.
	 */
	hasMemoryType(memoryType: string): boolean {
		return !!this.config.memoryTypeTags[memoryType];
	}
}

// ============================================
// Utility Functions
// ============================================

/**
 * Quick tag extraction with default configuration.
 */
export function extractTechnologyTags(content: string): TagExtractionResult {
	const extractor = new TagExtractor({
		defaultTags: [],
		minConfidence: 0.1,
		enableHeuristics: true,
	});
	return extractor.extractTags(content);
}

/**
 * Get list of all detectable technologies.
 */
export function getAllDetectableTechnologies(): string[] {
	const technologies = new Set<string>();

	// From keywords
	for (const tech of Object.keys(TECHNOLOGY_KEYWORDS)) {
		technologies.add(tech);
	}

	// From extensions
	for (const techs of Object.values(EXTENSION_PATTERNS)) {
		for (const tech of techs) {
			technologies.add(tech);
		}
	}

	// From imports
	for (const tech of Object.keys(IMPORT_PATTERNS)) {
		technologies.add(tech);
	}

	return Array.from(technologies).sort();
}

export default TagExtractor;
