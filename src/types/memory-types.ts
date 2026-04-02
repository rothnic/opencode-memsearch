import type { MemoryTypeConfig } from "./memory-type-config";
import {
	loadMemoryTypes,
	type ValidationError,
} from "./memory-type-config-loader";

export interface RegistryLoadError {
	source: string;
	path: string;
	error: string;
}

export class MemoryTypeRegistry {
	private memoryTypes: Map<string, MemoryTypeConfig>;
	private byCollection: Map<string, MemoryTypeConfig>;
	private errors: RegistryLoadError[];
	private readonly workdir: string;

	constructor(workdir: string) {
		this.workdir = workdir;
		this.memoryTypes = new Map();
		this.byCollection = new Map();
		this.errors = [];
		this.load(workdir);
	}

	private load(workdir: string): void {
		const result = loadMemoryTypes(workdir);

		for (const config of result.memoryTypes) {
			this.memoryTypes.set(config.name, config);
			this.byCollection.set(config.collection, config);
		}

		this.errors = result.validationErrors.map(
			(e: ValidationError): RegistryLoadError => ({
				source: e.source,
				path: e.path,
				error: e.error,
			}),
		);
	}

	getAll(): MemoryTypeConfig[] {
		return Array.from(this.memoryTypes.values());
	}

	getByName(name: string): MemoryTypeConfig | undefined {
		return this.memoryTypes.get(name);
	}

	getByCollection(collection: string): MemoryTypeConfig | undefined {
		return this.byCollection.get(collection);
	}

	hasName(name: string): boolean {
		return this.memoryTypes.has(name);
	}

	hasCollection(collection: string): boolean {
		return this.byCollection.has(collection);
	}

	getErrors(): RegistryLoadError[] {
		return [...this.errors];
	}

	hasErrors(): boolean {
		return this.errors.length > 0;
	}

	getWorkdir(): string {
		return this.workdir;
	}

	size(): number {
		return this.memoryTypes.size;
	}
}

export function createMemoryTypeRegistry(workdir: string): MemoryTypeRegistry {
	return new MemoryTypeRegistry(workdir);
}

export default MemoryTypeRegistry;
